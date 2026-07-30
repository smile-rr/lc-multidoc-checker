-- ============================================================================
-- Repeatable migration: views.
--
-- Flyway re-runs this whenever its checksum changes, so views evolve without a
-- version bump. Each is dropped before creation: CREATE OR REPLACE VIEW cannot
-- remove or reorder a column, and a view that silently refuses to change is worse
-- than one that is rebuilt.
--
-- Two jobs here:
--
--   read shapes     one query per screen, so a list view never fans out
--   latest-wins     lc_officer_action is append-only, so "what does the officer
--                   currently think" is DISTINCT ON over an ordered history.
--                   That projection belongs in one place, not in every caller.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The cases list, in one query.
--
-- reply_due_days is computed rather than stored: a stored countdown is wrong by
-- morning. NULL means nothing is outstanding.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_check.v_case_summary CASCADE;
CREATE VIEW helix_check.v_case_summary AS
SELECT c.id,
       c.case_ref,
       c.status,
       c.credit_ref,
       c.beneficiary,
       c.applicant,
       c.currency,
       c.amount,
       c.page_count,
       c.assigned_to,
       c.authoriser,
       c.stage,
       c.awaiting_officer,
       c.gate_halted,
       c.created_at,
       c.completed_at,
       CASE WHEN c.reply_due_date IS NULL THEN NULL
            ELSE GREATEST(0, (c.reply_due_date - CURRENT_DATE))
       END AS reply_due_days,
       (SELECT COUNT(*) FROM helix_check.lc_finding f
         WHERE f.case_id = c.id AND f.severity = 'discrepancy')          AS discrepancy_count,
       (SELECT COUNT(*) FROM helix_check.lc_finding f
         WHERE f.case_id = c.id AND f.severity IN ('possible', 'manual')) AS attention_count,
       (SELECT COUNT(*) FROM helix_check.lc_plan_check p
         WHERE p.case_id = c.id AND p.area_id IS NOT NULL)                AS checks_planned
FROM helix_check.lc_case c;


-- ----------------------------------------------------------------------------
-- Latest disposition per finding.
--
-- An officer who agrees, then parks, then agrees again leaves three rows. The
-- history is the record; this is the current answer.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_check.v_finding_decision CASCADE;
CREATE VIEW helix_check.v_finding_decision AS
SELECT DISTINCT ON (a.case_id, a.target)
       a.case_id,
       a.target                        AS finding_ref,
       a.payload ->> 'disposition'     AS disposition,
       a.note,
       a.officer_id,
       a.acted_at
FROM helix_check.lc_officer_action a
WHERE a.action = 'disposition'
ORDER BY a.case_id, a.target, a.acted_at DESC, a.seq DESC;


-- Latest free-text note per finding, kept separate from the disposition so
-- writing a note does not overwrite a decision and vice versa.
DROP VIEW IF EXISTS helix_check.v_finding_note CASCADE;
CREATE VIEW helix_check.v_finding_note AS
SELECT DISTINCT ON (a.case_id, a.target)
       a.case_id,
       a.target        AS finding_ref,
       a.note,
       a.officer_id,
       a.acted_at
FROM helix_check.lc_officer_action a
WHERE a.action = 'finding_note'
ORDER BY a.case_id, a.target, a.acted_at DESC, a.seq DESC;


-- The case-level sign-off: verdict, covering note, and whether it was submitted.
DROP VIEW IF EXISTS helix_check.v_case_verdict CASCADE;
CREATE VIEW helix_check.v_case_verdict AS
SELECT c.id AS case_id,
       v.payload ->> 'verdict' AS verdict,
       v.officer_id            AS decided_by,
       v.acted_at              AS decided_at,
       n.note                  AS review_note,
       (s.case_id IS NOT NULL) AS submitted,
       s.acted_at              AS submitted_at
FROM helix_check.lc_case c
LEFT JOIN LATERAL (
    SELECT * FROM helix_check.lc_officer_action a
     WHERE a.case_id = c.id AND a.action = 'verdict'
     ORDER BY a.acted_at DESC, a.seq DESC LIMIT 1) v ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM helix_check.lc_officer_action a
     WHERE a.case_id = c.id AND a.action = 'review_note'
     ORDER BY a.acted_at DESC, a.seq DESC LIMIT 1) n ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM helix_check.lc_officer_action a
     WHERE a.case_id = c.id AND a.action = 'submit'
     ORDER BY a.acted_at DESC, a.seq DESC LIMIT 1) s ON TRUE;


-- ----------------------------------------------------------------------------
-- Governance: the Checks list, with its group, agent and gate eligibility.
--
-- gate_eligible is computed here, in the one place that owns the dictionary,
-- rather than re-derived by every client that wants to render the toggle:
--
--   exact, has conditions, and every document its operands read is available
--   before the presentation has been examined
--
-- gate_on is stored intent narrowed by possibility. A rule that loses eligibility
-- — because an operand moved onto a presented document — stops being a gate,
-- rather than continuing to claim it runs first.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_gov.v_check_list CASCADE;
CREATE VIEW helix_gov.v_check_list AS
WITH pre AS (
    SELECT COALESCE(array_agg(code), '{}') AS codes
    FROM helix_gov.doc_type WHERE before_reading
),
base AS (
    SELECT c.*,
           (r.check_id IS NOT NULL
            AND jsonb_array_length(COALESCE(r.groups, '[]'::jsonb)) > 0) AS has_conditions,
           -- All three conditions, in one place. Eligibility is derived, never asserted:
           --   exact          an agent cannot read documents before they are read
           --   has conditions there is nothing to run
           --   operands ⊆ pre a rule that reads the bill of lading cannot precede it
           (c.check_type = 'PROGRAMMATIC'
            AND r.check_id IS NOT NULL
            AND jsonb_array_length(COALESCE(r.groups, '[]'::jsonb)) > 0
            AND c.operand_docs <@ pre.codes) AS gate_eligible,
           g.name     AS group_name,
           a.name     AS agent_name,
           a.category AS agent_category
    FROM helix_gov.check_def c
    CROSS JOIN pre
    LEFT JOIN helix_gov.check_group g ON g.id = c.group_id
    LEFT JOIN helix_gov.agent       a ON a.id = c.agent_id
    LEFT JOIN helix_gov.check_rule  r ON r.check_id = c.id
)
SELECT b.id,
       b.version,
       b.status,
       b.title,
       b.domain,
       b.severity,
       b.check_type,
       CASE WHEN b.check_type = 'PROGRAMMATIC' THEN 'EXACT' ELSE 'JUDGED' END AS tier,
       b.cited_as,
       b.refs,
       b.field_refs,
       b.doc_types,
       b.operand_docs,
       b.cases_count,
       b.group_id,
       b.group_name,
       b.agent_id,
       b.agent_name,
       b.agent_category,
       b.has_conditions,
       b.gate_eligible,
       -- Stored intent narrowed by possibility, against the WHOLE of eligibility.
       -- Narrowing by document availability alone lets a judged rule, or an exact
       -- rule with no conditions authored yet, keep claiming it runs first — which
       -- is the one thing this column exists to prevent.
       (b.is_gate AND b.gate_eligible)                              AS gate_on,
       (SELECT COUNT(*) FROM helix_gov.comment m
         WHERE m.target_kind = 'CHECK' AND m.target_id = b.id)      AS comment_count,
       b.updated_at
FROM base b;


-- A dictionary field with the documents it is read from, and how often it is
-- named by a check. The usage count is what makes a delete safe to refuse.
DROP VIEW IF EXISTS helix_gov.v_dict_field_usage CASCADE;
CREATE VIEW helix_gov.v_dict_field_usage AS
SELECT f.key,
       f.name,
       f.kind,
       f.value_type,
       f.field_group,
       f.source_tags,
       f.rule_relevant,
       f.description,
       f.seeded,
       COALESCE(b.doc_codes, '{}') AS doc_codes,
       COALESCE(b.binding_count, 0) AS binding_count,
       (SELECT COUNT(*) FROM helix_gov.check_def c WHERE f.key = ANY (c.field_refs)) AS used_by_checks
FROM helix_gov.dict_field f
LEFT JOIN LATERAL (
    SELECT array_agg(fb.doc_code ORDER BY fb.ordinal) AS doc_codes,
           COUNT(*)                                   AS binding_count
    FROM helix_gov.field_binding fb WHERE fb.field_key = f.key) b ON TRUE;


-- A document type with what depends on it. before_reading is surfaced because it
-- is the flag that decides which rules can ever be hard checks.
DROP VIEW IF EXISTS helix_gov.v_doc_type_usage CASCADE;
CREATE VIEW helix_gov.v_doc_type_usage AS
SELECT d.code,
       d.name,
       d.name_zh,
       d.description,
       d.before_reading,
       d.ordinal,
       d.active,
       (SELECT COUNT(*) FROM helix_gov.field_binding fb WHERE fb.doc_code = d.code) AS bound_fields,
       (SELECT COUNT(*) FROM helix_gov.check_def c WHERE d.code = ANY (c.doc_types)) AS used_by_checks
FROM helix_gov.doc_type d;
