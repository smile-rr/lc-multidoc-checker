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
       c.decision_status,
       -- The engine's own counts. An officer's override is not applied here: this
       -- view feeds the case list, which is read before anybody opens the case, and
       -- resolving overrides per row would make a list query walk the action log.
       -- The workbench resolves them; the list reports what was found.
       (SELECT COUNT(*) FROM helix_check.lc_finding f
         WHERE f.case_id = c.id AND f.outcome = 'DISCREPANT')            AS discrepancy_count,
       (SELECT COUNT(*) FROM helix_check.lc_finding f
         WHERE f.case_id = c.id AND f.outcome = 'DOUBT')                 AS attention_count,
       (SELECT COUNT(*) FROM helix_check.lc_plan_check p
         WHERE p.case_id = c.id AND p.area_id IS NOT NULL)                AS checks_planned
FROM helix_check.lc_case c;


-- ----------------------------------------------------------------------------
-- The officer's override per finding, where there is one.
--
-- An officer who clears a discrepancy, reinstates it, then clears it again leaves
-- three rows. The history is the record; this is the current answer.
--
-- **Withdrawing an override is an append, not a delete** — `outcome_override_cleared`
-- wins if it is the latest row, and `outcome` comes back NULL, which means the
-- engine's own value stands. Deleting the row instead would lose the fact that
-- somebody disagreed and then thought better of it, which is exactly the kind of
-- thing an examination file is for.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_check.v_finding_override CASCADE;
CREATE VIEW helix_check.v_finding_override AS
SELECT case_id, finding_ref, outcome, note, officer_id, acted_at
FROM (
    SELECT DISTINCT ON (a.case_id, a.target)
           a.case_id,
           a.target                                                     AS finding_ref,
           CASE WHEN a.action = 'outcome_override'
                THEN a.payload ->> 'outcome' END                        AS outcome,
           a.note,
           a.officer_id,
           a.acted_at
    FROM helix_check.lc_officer_action a
    WHERE a.action IN ('outcome_override', 'outcome_override_cleared')
    ORDER BY a.case_id, a.target, a.acted_at DESC, a.seq DESC
) latest
WHERE outcome IS NOT NULL;


-- Latest free-text note per finding, kept separate from the override so
-- writing a note does not overwrite a call and vice versa.
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


-- The case-level sign-off: where the presentation landed, the covering note, and
-- whether it was submitted.
--
-- `status` is what the officer settled on. NULL means nobody overrode the derived
-- value — which is not stored, because it moves whenever an override does.
DROP VIEW IF EXISTS helix_check.v_case_verdict CASCADE;
CREATE VIEW helix_check.v_case_verdict AS
SELECT c.id AS case_id,
       COALESCE(v.payload ->> 'status', c.decision_status) AS status,
       v.officer_id            AS decided_by,
       v.acted_at              AS decided_at,
       n.note                  AS review_note,
       (s.case_id IS NOT NULL) AS submitted,
       s.acted_at              AS submitted_at
FROM helix_check.lc_case c
LEFT JOIN LATERAL (
    SELECT * FROM helix_check.lc_officer_action a
     WHERE a.case_id = c.id AND a.action = 'decision_status'
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
-- Governance: one collection, five kinds, and the readable surface over it.
--
-- The base table is (kind, id, body). These views are what everything else reads, so
-- a caller writes `WHERE status <> 'RETIRED'` and never a jsonb operator. That is the
-- job generated columns were doing, done in the one place that does not have to be
-- maintained per attribute.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS helix_gov.v_doc_type CASCADE;
CREATE VIEW helix_gov.v_doc_type AS
SELECT d.id                                                      AS code,
       d.body,
       d.body ->> 'name'                                         AS name,
       d.body ->> 'description'                                  AS description,
       d.body ->> 'role'                                         AS role,
       COALESCE((d.body ->> 'beforeReading')::boolean, FALSE)     AS before_reading,
       COALESCE((d.body ->> 'ordinal')::int, 0)                   AS ordinal,
       COALESCE((d.body ->> 'active')::boolean, TRUE)             AS active,
       d.updated_at
  FROM helix_gov.document d WHERE d.kind = 'doc_type';

DROP VIEW IF EXISTS helix_gov.v_field CASCADE;
CREATE VIEW helix_gov.v_field AS
SELECT f.id                                                      AS key,
       f.body,
       f.body ->> 'name'                                         AS name,
       f.body ->> 'valueType'                                    AS value_type,
       f.updated_at
  FROM helix_gov.document f WHERE f.kind = 'field';

DROP VIEW IF EXISTS helix_gov.v_agent CASCADE;
CREATE VIEW helix_gov.v_agent AS
SELECT a.id, a.body, COALESCE((a.body ->> 'ordinal')::int, 0) AS ordinal, a.updated_at
  FROM helix_gov.document a WHERE a.kind = 'agent';

DROP VIEW IF EXISTS helix_gov.v_book CASCADE;
CREATE VIEW helix_gov.v_book AS
SELECT b.id, b.body, COALESCE((b.body ->> 'ordinal')::int, 0) AS ordinal, b.updated_at
  FROM helix_gov.document b WHERE b.kind = 'book';

-- Every article, addressable by the code a check cites. `{{ref.X.text}}` resolves here.
DROP VIEW IF EXISTS helix_gov.v_article CASCADE;
CREATE VIEW helix_gov.v_article AS
SELECT b.id                     AS book_id,
       b.body ->> 'title'       AS book_title,
       a ->> 'code'             AS code,
       a ->> 'title'            AS title,
       a ->> 'section'          AS section,
       a ->> 'summary'          AS summary,
       a ->> 'read'             AS body
  FROM helix_gov.v_book b, jsonb_array_elements(COALESCE(b.body -> 'articles', '[]'::jsonb)) a;

-- ----------------------------------------------------------------------------
-- Every (field, document) binding, flattened out of the field documents. This is the
-- extraction spec: what to read off a document, and how to read it there.
--
-- `kind` decides WHICH READING answers the binding, and is therefore not decoration.
-- DOC_ATTESTATION means the value is a property of the page rather than a string on it —
-- is it signed, is it an original, is the correction initialled — and those are settled by
-- the attest pass, not by reading characters. Everything else is ordinary extraction.
--
-- Which also makes the binding set the demand model. A document type with no
-- DOC_ATTESTATION binding gets no attest pass at all, so a packing list in a 100-page
-- bundle costs nothing, and an author turns the pass on for it by adding a binding in the
-- console rather than by a code change.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_gov.v_field_binding CASCADE;
CREATE VIEW helix_gov.v_field_binding AS
SELECT f.key                                        AS field_key,
       f.name                                       AS field_name,
       f.value_type,
       -- Absent means LC_FIELD, which is what dict_field defaulted to when kind was a
       -- column. A binding authored before this view existed must not become an
       -- attestation by omission.
       COALESCE(f.body ->> 'kind', 'LC_FIELD')      AS kind,
       b ->> 'doc'                                  AS doc_code,
       b ->> 'note'                                 AS note,
       COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(b -> 'aliases')), '{}') AS aliases,
       COALESCE((b ->> 'ordinal')::int, 0)          AS ordinal
  FROM helix_gov.v_field f,
       jsonb_array_elements(COALESCE(f.body -> 'bindings', '[]'::jsonb)) b;

-- ----------------------------------------------------------------------------
-- The checks list, with the operands its rule reads and whether it can therefore be a
-- hard check.
--
-- `operand_docs` is read out of the rule rather than stored beside it, so it cannot
-- disagree with the rule it came from.
--
-- gate_eligible is all three conditions in one place, derived and never asserted:
--   exact           an agent cannot read documents before they have been read
--   has conditions  there is nothing to run
--   operands ⊆ pre  a rule that reads the bill of lading cannot precede it
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_gov.v_check_list CASCADE;
CREATE VIEW helix_gov.v_check_list AS
WITH pre AS (
    SELECT COALESCE(array_agg(code), '{}') AS codes FROM helix_gov.v_doc_type WHERE before_reading
),
checks AS (
    SELECT c.id, c.body, c.updated_at,
           COALESCE(c.body ->> 'status', 'ACTIVE')       AS status,
           COALESCE(c.body ->> 'checkType', 'AGENT')      AS check_type,
           COALESCE((c.body ->> 'gate')::boolean, FALSE)  AS is_gate,
           -- Whether the condition asks for a reading rather than a comparison.
           --
           -- Four operators are judgements wearing an operator's clothes: "does not
           -- conflict with" is UCP 600 art. 14(d), and deciding whether "WIDGETS, MODEL
           -- IW-2024" conflicts with "INDUSTRIAL WIDGETS" is an examiner's judgement, not
           -- a string comparison. A check using one CANNOT be settled by comparison,
           -- whatever its author typed in `checkType`.
           --
           -- Derived here rather than discovered at run time. It used to be the engine
           -- that noticed, halfway through executing a check the console had drawn as
           -- "Comparison", and rerouted it to a model — so a card said "settled by
           -- comparison" and produced a model's opinion. Which kind of check something is
           -- is the rulebook's answer, and it is knowable the moment it is authored.
           EXISTS (
               SELECT 1
                 FROM jsonb_path_query(c.body, '$.rule.groups[*].rows[*].op') o
                WHERE o #>> '{}' IN ('noconflict', 'same_party', 'same_country',
                                     'addr_same_country')
           ) AS has_judgement_op
      FROM helix_gov.document c WHERE c.kind = 'check'
),
-- What SQL cannot read off the check itself. An expression has no groups and no rows, so
-- every derivation below that walks `$.rule.groups[*]` finds nothing for one — see V29.
facet AS (
    SELECT f.check_id, f.language, f.judgement,
           COALESCE(array_agg(DISTINCT r ->> 'doc') FILTER (WHERE r ->> 'doc' IS NOT NULL), '{}') AS docs,
           COUNT(*) FILTER (WHERE r IS NOT NULL) AS read_count
      FROM helix_gov.check_facet f
      LEFT JOIN LATERAL jsonb_array_elements(f.reads) r ON TRUE
     GROUP BY f.check_id, f.language, f.judgement
),
operands AS (
    SELECT c.id,
           COALESCE(array_agg(DISTINCT d) FILTER (WHERE d IS NOT NULL), '{}') AS docs,
           COUNT(*) FILTER (WHERE d IS NOT NULL)                              AS row_count
      FROM checks c
      LEFT JOIN LATERAL (
          SELECT jsonb_path_query(c.body, '$.rule.groups[*].rows[*].l.doc') #>> '{}' AS d
          UNION ALL
          SELECT jsonb_path_query(c.body, '$.rule.groups[*].rows[*].r.doc') #>> '{}'
      ) t ON TRUE
     GROUP BY c.id
)
SELECT c.id,
       c.body,
       c.status,
       c.check_type,
       -- Stored intent narrowed by possibility, exactly like gate_on below. An author
       -- may type PROGRAMMATIC over a condition that asks for a judgement; they cannot
       -- make it one.
       CASE WHEN c.check_type IN ('PROGRAMMATIC', 'EXPRESSION')
             AND NOT (c.has_judgement_op OR COALESCE(f.judgement, FALSE))
            THEN 'EXACT' ELSE 'JUDGED' END                        AS tier,
       (c.has_judgement_op OR COALESCE(f.judgement, FALSE))       AS has_judgement_op,
       (o.docs || COALESCE(f.docs, '{}'))                         AS operand_docs,
       -- A FACET IS ITSELF EVIDENCE OF A CONDITION.
       --
       -- Counting what a rule READS is right for a tree, whose rows are operands, and
       -- wrong for a table whose condition is a question an examiner answers: that reads
       -- no field at all, so counting reads called it conditionless and it drew as a card
       -- somebody had not finished — never planned, never run. The facet exists only
       -- because the rule compiled, so its existence is the answer.
       (o.row_count > 0 OR f.check_id IS NOT NULL)                 AS has_conditions,
       COALESCE(f.language, 'TREE')                               AS language,
       -- AN AGENT CHECK CAN NEVER BE A THRESHOLD CHECK.
       --
       -- A gate runs before anything has been read, to decide whether reading is worth
       -- paying for. A judgement costs a model call, so gating on one spends the money
       -- the gate exists to save — and it does it on the least evidence, since nothing
       -- has been read yet. This tested the DECLARED check_type, so a check typed
       -- PROGRAMMATIC over a `same_party` row qualified: an agent rule, gating.
       (c.check_type IN ('PROGRAMMATIC', 'EXPRESSION')
        AND NOT (c.has_judgement_op OR COALESCE(f.judgement, FALSE))
        AND (o.row_count > 0 OR COALESCE(f.read_count, 0) > 0)
        AND (o.docs || COALESCE(f.docs, '{}')) <@ pre.codes)      AS gate_eligible,
       (c.is_gate AND c.check_type IN ('PROGRAMMATIC', 'EXPRESSION')
        AND NOT (c.has_judgement_op OR COALESCE(f.judgement, FALSE))
        AND (o.row_count > 0 OR COALESCE(f.read_count, 0) > 0)
        AND (o.docs || COALESCE(f.docs, '{}')) <@ pre.codes)      AS gate_on,
       (SELECT COUNT(*) FROM helix_gov.comment m
         WHERE m.target_kind = 'CHECK' AND m.target_id = c.id)    AS comment_count,
       c.updated_at
  FROM checks c
  CROSS JOIN pre
  JOIN operands o ON o.id = c.id
  LEFT JOIN facet f ON f.check_id = c.id;

-- ----------------------------------------------------------------------------
-- A reference to something that is not there.
--
-- The database used to refuse the first of these with a foreign key, which stopped the
-- mistake and told the author nothing they could act on. The console maintains the
-- reference now; this is how anyone sees where it did not.
--
-- The third row type is the one that costs an examination. An operand naming a document
-- that exists and a FIELD NOBODY READS FROM IT compiles, stores, plans and runs — and
-- returns INCONCLUSIVE on every presentation for ever, because the fact it joins on is
-- never written. It looks exactly like a check that ran. The seeded expiry gate did this
-- for its whole life: it compared `place_of_presentation` on the covering schedule, and
-- only the credit had a binding for that field, so the one check that runs before
-- anything is read could never return PASS.
--
-- `RuleCompiler` rejects precisely this in a rule the planner wrote. Nothing rejects it
-- in a rule a person wrote, because an author is allowed to get ahead of the dictionary —
-- so it is reported rather than refused.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_gov.v_dangling_reference CASCADE;
CREATE VIEW helix_gov.v_dangling_reference AS
SELECT 'field_binding'  AS whose, b.field_key AS id, b.doc_code AS missing_doc_code,
       NULL::text       AS missing_field_key
  FROM helix_gov.v_field_binding b
 WHERE NOT EXISTS (SELECT 1 FROM helix_gov.v_doc_type d WHERE d.code = b.doc_code)
UNION ALL
SELECT 'check_operand', c.id, d, NULL
  FROM helix_gov.v_check_list c, unnest(c.operand_docs) d
 WHERE NOT EXISTS (SELECT 1 FROM helix_gov.v_doc_type t WHERE t.code = d)
UNION ALL
SELECT 'check_operand_field', o.id, o.doc, o.field
  FROM (
      SELECT c.id,
             q ->> 'doc'   AS doc,
             q ->> 'field' AS field
        FROM helix_gov.document c,
             LATERAL (
                 SELECT jsonb_path_query(c.body, '$.rule.groups[*].rows[*].l') AS q
                 UNION ALL
                 SELECT jsonb_path_query(c.body, '$.rule.groups[*].rows[*].r')
             ) t
       WHERE c.kind = 'check'
         AND q ->> 'doc' IS NOT NULL
         AND q ->> 'field' IS NOT NULL
  ) o
 WHERE EXISTS (SELECT 1 FROM helix_gov.v_doc_type t WHERE t.code = o.doc)
   AND NOT EXISTS (SELECT 1 FROM helix_gov.v_field_binding b
                    WHERE b.doc_code = o.doc AND b.field_key = o.field)
UNION ALL
-- The same mistake, in the language SQL cannot read.
--
-- {BOL.port_of_lading} parses perfectly and is a typo, exactly as a tree operand naming an
-- unbound field is. The compiler refuses to STORE one — but a field can be unbound later,
-- and a check that was correct when it was written becomes unanswerable without anybody
-- touching it. That is precisely what this view is for, and leaving the new language out of
-- it would give it a blind spot from its first day.
SELECT 'check_expression_field', f.check_id, r ->> 'doc', r ->> 'field'
  FROM helix_gov.check_facet f, LATERAL jsonb_array_elements(f.reads) r
 WHERE r ->> 'doc' <> '*'
   AND EXISTS (SELECT 1 FROM helix_gov.v_doc_type t WHERE t.code = r ->> 'doc')
   AND NOT EXISTS (SELECT 1 FROM helix_gov.v_field_binding b
                    WHERE b.doc_code = r ->> 'doc' AND b.field_key = r ->> 'field');

-- ----------------------------------------------------------------------------
-- Usage counts, for the console's "in use by" chips.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS helix_gov.v_dict_field_usage CASCADE;
CREATE VIEW helix_gov.v_dict_field_usage AS
SELECT f.key,
       f.body,
       f.value_type,
       COALESCE(ARRAY(SELECT b.doc_code FROM helix_gov.v_field_binding b
                       WHERE b.field_key = f.key ORDER BY b.ordinal), '{}') AS doc_codes,
       (SELECT COUNT(*) FROM helix_gov.document c
         WHERE c.kind = 'check' AND c.body -> 'fields' @> to_jsonb(f.key))  AS used_by_checks,
       f.updated_at
  FROM helix_gov.v_field f;

DROP VIEW IF EXISTS helix_gov.v_doc_type_usage CASCADE;
CREATE VIEW helix_gov.v_doc_type_usage AS
SELECT d.code,
       d.body,
       d.role,
       d.before_reading,
       d.ordinal,
       d.active,
       (SELECT COUNT(*) FROM helix_gov.v_field_binding b WHERE b.doc_code = d.code) AS bound_fields,
       (SELECT COUNT(*) FROM helix_gov.document c
         WHERE c.kind = 'check' AND c.body -> 'docs' @> to_jsonb(d.code))           AS used_by_checks,
       d.updated_at
  FROM helix_gov.v_doc_type d;
