-- ============================================================================
-- LC Checker V2 schema — lc_v2  (consolidated)
--
-- Six tables. Three forces, three role-distinct stores:
--   System computes  → pipeline_steps   (idempotent, latest-wins, UNIQUE step_key)
--   Stream replays   → pipeline_events  (transport — SSE replay tape)
--   Officer decides  → officer_actions  (audit, append-only)
--
-- Plus session umbrella, document inputs, and the dynamic-rule cache.
--
--   check_sessions       session metadata (NO final_report column)
--   documents            uploaded files + lifecycle
--   pipeline_steps       every system output, every stage  (UNIFIED)
--                        signoff/report is just another step
--   pipeline_events      append-only SSE replay log
--   officer_actions      every officer decision (UNIFIED, append-only)
--                        (replaces adhoc_rule_cache; sha256-keyed)
--
-- Schema evolution lives in views below. New stage = zero DDL.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS lc_v2;

-- ============================================================================
-- Migration: drop retired structures (idempotent — safe on fresh installs).
-- Tables dropped: extraction_results, reconcile_state, reconcile_cell_decisions,
-- rule_confirmations, examine_overrides, signoff, adhoc_rule_cache.
-- Column dropped: check_sessions.final_report.
--
-- DROP TABLE … CASCADE wipes any view that referenced them; recreated below.
-- ============================================================================
DROP VIEW  IF EXISTS lc_v2.v_session_overview        CASCADE;
DROP VIEW  IF EXISTS lc_v2.v_latest_session          CASCADE;
DROP VIEW  IF EXISTS lc_v2.v_rule_confirmations      CASCADE;

DROP TABLE IF EXISTS lc_v2.signoff                    CASCADE;
DROP TABLE IF EXISTS lc_v2.examine_overrides          CASCADE;
DROP TABLE IF EXISTS lc_v2.rule_confirmations         CASCADE;
DROP TABLE IF EXISTS lc_v2.reconcile_cell_decisions   CASCADE;
DROP TABLE IF EXISTS lc_v2.reconcile_state            CASCADE;
DROP TABLE IF EXISTS lc_v2.extraction_results         CASCADE;
DROP TABLE IF EXISTS lc_v2.adhoc_rule_cache           CASCADE;

ALTER TABLE IF EXISTS lc_v2.check_sessions DROP COLUMN IF EXISTS final_report;
ALTER TABLE IF EXISTS lc_v2.check_sessions DROP COLUMN IF EXISTS adhoc_cache_key;

-- ---------------------------------------------------------------------------
-- check_sessions — session umbrella (one row per LC examination job)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.check_sessions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    status          VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    -- QUEUED | INTAKE | PARSE | RECONCILE | EXAMINE | SIGNOFF | AWAITING_OFFICER | COMPLETED | FAILED
    next_stage      VARCHAR(20),
    awaiting_officer BOOLEAN NOT NULL DEFAULT FALSE,
    stage_completed_at JSONB NOT NULL DEFAULT '{}'::jsonb,
    compliant       BOOLEAN,
    error           TEXT,
    doc_count       INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    enqueued_at     TIMESTAMP,
    dequeued_at     TIMESTAMP,
    queue_attempt   INT          NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_v2_sessions_status     ON lc_v2.check_sessions(status);
CREATE INDEX IF NOT EXISTS idx_v2_sessions_created_at ON lc_v2.check_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_v2_sessions_queue
    ON lc_v2.check_sessions(status, enqueued_at)
    WHERE status = 'QUEUED';

-- ---------------------------------------------------------------------------
-- documents — one row per uploaded file
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.documents (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    doc_type              VARCHAR(20)  NOT NULL,   -- LC | INV | BOL | PKL | BOE | BC | WC | UNKNOWN
    original_filename     TEXT,
    file_sha256           CHAR(64),
    page_count            INT,
    parse_status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    -- PENDING | EXTRACTING | EXTRACTED | REVIEWED | FAILED
    classification_conf   NUMERIC(4,3),
    confirmed_by_officer  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_docs_session    ON lc_v2.documents(session_id);
CREATE INDEX IF NOT EXISTS idx_v2_docs_type       ON lc_v2.documents(session_id, doc_type);

-- ---------------------------------------------------------------------------
-- pipeline_steps — every system output, every stage. Idempotent: re-running
-- a stage upserts the same row keyed by (session, stage, step_key).
--
-- step_key conventions:
--   intake/lc_parse                          MT700 parse result
--   intake/required_docs                     :46A: parsed required-doc checklist
--   parse/extract:<doc_type>:<slot>          per-slot vision extract
--   parse/consensus:<doc_type>               majority-vote consensus
--   reconcile/field:<field_key>              one row per canonical field
--   examine/<rule_id>                        per-rule outcome
--   examine/phase:<phase_name>               phase summary
--   examine/meta                             trigger traces, dynamic rules, consistency
--   signoff/report                           the assembled "final report"
--
-- result JSONB shape varies by step (each view projects its own scalars).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.pipeline_steps (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    stage         VARCHAR(40)  NOT NULL,
    step_key      VARCHAR(100) NOT NULL DEFAULT '-',
    status        VARCHAR(30)  NOT NULL,
    started_at    TIMESTAMP    NOT NULL,
    completed_at  TIMESTAMP,
    duration_ms   BIGINT,
    result        JSONB,
    error         TEXT,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, stage, step_key)
);

CREATE INDEX IF NOT EXISTS idx_v2_ps_session       ON lc_v2.pipeline_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_v2_ps_session_stage ON lc_v2.pipeline_steps(session_id, stage);

-- ---------------------------------------------------------------------------
-- pipeline_events — append-only SSE replay tape.
-- No FK to check_sessions: session.started events fire before the session row
-- is fully populated; we don't want one race to lose those early events.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.pipeline_events (
    session_id  UUID      NOT NULL,
    seq         BIGINT    NOT NULL,
    event       JSONB     NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_v2_pe_session ON lc_v2.pipeline_events(session_id, seq);

-- ---------------------------------------------------------------------------
-- officer_actions — append-only audit log of every officer decision.
--
-- "Current state" of any officer-mutable thing = latest row per
-- (session_id, action, target). Wrapped in views below so callers never
-- write the DISTINCT ON query themselves.
--
-- action vocabulary:
--   doc_type_changed         (target = doc_id, payload {from, to})
--   doc_reviewed             (target = doc_id)
--   field_corrected          (target = "<doc_id>:<field_key>", payload {value, issue_kind})
--   cell_decision            (target = "<field_key>:<doc_type>", payload {decision, value?})
--   cell_decision_cleared    (target same as cell_decision)
--   rule_override            (target = rule_id, payload {new_status, reason, flagged})
--   rule_override_cleared    (target = rule_id)
--   lock | unlock            (target = '-', payload optional reason)
--   signoff                  (target = '-', payload {decision, dispositions, frozen})
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.officer_actions (
    session_id  UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    seq         BIGSERIAL,
    action      VARCHAR(40)  NOT NULL,
    target      TEXT,
    payload     JSONB,
    officer_id  VARCHAR(100) NOT NULL,
    note        TEXT,
    acted_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_oa_action_target
    ON lc_v2.officer_actions (session_id, action, target, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_oa_officer
    ON lc_v2.officer_actions (officer_id, acted_at DESC);

-- ============================================================================
-- Views — projections over pipeline_steps + officer_actions.
--
-- Controllers query these; they never see JSONB shape directly.
-- ============================================================================

-- ── System-output projections (over pipeline_steps) ───────────────────────

CREATE OR REPLACE VIEW lc_v2.v_lc_parse AS
SELECT  session_id,
        result->>'raw_mt700'    AS raw_mt700,
        result->'fields'        AS fields,
        result->'rawFields'     AS raw_fields,
        result->'derived'       AS derived,
        result->'warnings'      AS warnings,
        completed_at            AS parsed_at
FROM    lc_v2.pipeline_steps
WHERE   stage = 'intake' AND step_key = 'lc_parse';

CREATE OR REPLACE VIEW lc_v2.v_required_docs AS
SELECT  session_id,
        result->>'parsed46A'    AS parsed_46a,
        result->'required'      AS required
FROM    lc_v2.pipeline_steps
WHERE   stage = 'intake' AND step_key = 'required_docs';

-- Per-doc consensus extract row from Parse stage.
CREATE OR REPLACE VIEW lc_v2.v_doc_extracts_consensus AS
SELECT  ps.session_id,
        d.id                                       AS document_id,
        split_part(ps.step_key, ':', 2)            AS doc_type,
        ps.result->'fields'                        AS fields,
        ps.result->'off_schema_items'              AS off_schema_items,
        (ps.result->>'overall_confidence')::numeric AS overall_confidence,
        ps.completed_at                            AS extracted_at
FROM    lc_v2.pipeline_steps ps
JOIN    lc_v2.documents d
  ON    d.session_id = ps.session_id
  AND   d.doc_type   = split_part(ps.step_key, ':', 2)
WHERE   ps.stage = 'parse' AND ps.step_key LIKE 'consensus:%';

-- Per-doc per-slot extract rows.
CREATE OR REPLACE VIEW lc_v2.v_doc_extracts_slots AS
SELECT  ps.session_id,
        d.id                              AS document_id,
        split_part(ps.step_key, ':', 2)   AS doc_type,
        split_part(ps.step_key, ':', 3)   AS slot,
        ps.result->'fields'               AS fields,
        ps.completed_at                   AS extracted_at
FROM    lc_v2.pipeline_steps ps
JOIN    lc_v2.documents d
  ON    d.session_id = ps.session_id
  AND   d.doc_type   = split_part(ps.step_key, ':', 2)
WHERE   ps.stage = 'parse' AND ps.step_key LIKE 'extract:%';

CREATE OR REPLACE VIEW lc_v2.v_reconcile_rows AS
SELECT  session_id,
        substring(step_key from 7)                          AS field_key,  -- strip 'field:' prefix
        result->>'label'                                    AS label,
        result->>'group'                                    AS field_group,
        result->>'field_type'                               AS field_type,
        result->>'row_verdict'                              AS row_verdict,
        result->>'discrepancy_detail'                       AS discrepancy_detail,
        result->'value_by_doc_type'                         AS value_by_doc_type,
        result->'cell_status'                               AS cell_status,
        result->'cell_detail'                               AS cell_detail,
        completed_at                                        AS computed_at
FROM    lc_v2.pipeline_steps
WHERE   stage = 'reconcile' AND step_key LIKE 'field:%';

CREATE OR REPLACE VIEW lc_v2.v_examine_phases AS
SELECT  session_id,
        substring(step_key from 7)                AS phase,  -- strip 'phase:' prefix
        (result->>'ran')::int                     AS ran,
        (result->>'passed')::int                  AS passed,
        (result->>'discrepant')::int              AS discrepant,
        (result->>'unable_to_verify')::int        AS unable_to_verify,
        (result->>'not_applicable')::int          AS not_applicable,
        (result->>'requires_human_review')::int   AS requires_human_review,
        duration_ms,
        started_at,
        completed_at
FROM    lc_v2.pipeline_steps
WHERE   stage = 'examine' AND step_key LIKE 'phase:%';

CREATE OR REPLACE VIEW lc_v2.v_check_results AS
SELECT  session_id,
        step_key                                      AS rule_id,
        result->>'check_type'                         AS check_type,
        status                                        AS system_verdict,
        (result->>'confidence')::numeric              AS confidence,
        result->>'explanation'                        AS explanation,
        result->'evidence'                            AS evidence,
        result->'trigger_trace'                       AS trigger_trace,
        duration_ms,
        started_at,
        completed_at,
        error
FROM    lc_v2.pipeline_steps
WHERE   stage = 'examine'
  AND   step_key NOT LIKE 'phase:%'
  AND   step_key <> 'meta';

-- Drop-then-create: v_examine_meta dropped adhoc_rules when the planner was
-- removed; CREATE OR REPLACE VIEW cannot drop columns in Postgres.
DROP VIEW IF EXISTS lc_v2.v_examine_meta;
CREATE VIEW lc_v2.v_examine_meta AS
SELECT  session_id,
        result->'consistency_warnings'     AS consistency_warnings,
        result->'consistency'              AS consistency,
        result->'trigger_traces'           AS trigger_traces
FROM    lc_v2.pipeline_steps
WHERE   stage = 'examine' AND step_key = 'meta';

CREATE OR REPLACE VIEW lc_v2.v_signoff_report AS
SELECT  session_id,
        result          AS report,
        completed_at    AS signed_at
FROM    lc_v2.pipeline_steps
WHERE   stage = 'signoff' AND step_key = 'report';

-- ── Officer-state projections (over officer_actions, "latest wins") ─────────

CREATE OR REPLACE VIEW lc_v2.v_lock_state AS
SELECT  session_id,
        action = 'lock'                  AS locked,
        acted_at                         AS locked_at,
        officer_id                       AS locked_by_officer,
        payload->>'reason'               AS unlock_reason
FROM   (
    SELECT DISTINCT ON (session_id)
           session_id, action, payload, officer_id, acted_at
    FROM   lc_v2.officer_actions
    WHERE  action IN ('lock', 'unlock')
    ORDER  BY session_id, acted_at DESC
) latest;

CREATE OR REPLACE VIEW lc_v2.v_cell_decisions AS
SELECT  session_id,
        split_part(target, ':', 1)         AS field_key,
        split_part(target, ':', 2)         AS doc_type,
        payload->>'decision'               AS decision,
        payload->>'value'                  AS value,
        note,
        officer_id,
        acted_at                           AS decided_at
FROM   (
    SELECT DISTINCT ON (session_id, target)
           session_id, action, target, payload, note, officer_id, acted_at
    FROM   lc_v2.officer_actions
    WHERE  action IN ('cell_decision', 'cell_decision_cleared')
    ORDER  BY session_id, target, acted_at DESC
) latest
WHERE   action = 'cell_decision';   -- cleared rows are filtered out

CREATE OR REPLACE VIEW lc_v2.v_rule_overrides AS
SELECT  session_id,
        target                             AS rule_id,
        payload->>'new_status'             AS new_status,
        payload->>'reason'                 AS reason,
        (payload->>'flagged')::boolean     AS flagged,
        note,
        officer_id,
        acted_at                           AS created_at
FROM   (
    SELECT DISTINCT ON (session_id, target)
           session_id, action, target, payload, note, officer_id, acted_at
    FROM   lc_v2.officer_actions
    WHERE  action IN ('rule_override', 'rule_override_cleared')
    ORDER  BY session_id, target, acted_at DESC
) latest
WHERE   action = 'rule_override';

CREATE OR REPLACE VIEW lc_v2.v_field_corrections AS
SELECT  session_id,
        (split_part(target, ':', 1))::uuid AS document_id,
        split_part(target, ':', 2)         AS field_key,
        payload->>'value'                  AS value,
        payload->>'issue_kind'             AS issue_kind,
        note,
        officer_id,
        acted_at                           AS corrected_at
FROM   (
    SELECT DISTINCT ON (session_id, target)
           session_id, target, payload, note, officer_id, acted_at
    FROM   lc_v2.officer_actions
    WHERE  action = 'field_corrected'
    ORDER  BY session_id, target, acted_at DESC
) latest;

CREATE OR REPLACE VIEW lc_v2.v_signoff AS
SELECT DISTINCT ON (session_id)
        session_id,
        payload->>'decision'                  AS decision,
        payload->'dispositions'               AS discrepancy_dispositions,
        note                                  AS officer_note,
        acted_at                              AS signed_at,
        officer_id,
        COALESCE((payload->>'frozen')::boolean, true) AS frozen
FROM    lc_v2.officer_actions
WHERE   action = 'signoff'
ORDER BY session_id, acted_at DESC;

-- ============================================================================
-- Convenience views — session list with display scalars projected from
-- pipeline_steps (intake/lc_parse).
-- ============================================================================

CREATE OR REPLACE VIEW lc_v2.v_session_overview AS
SELECT  s.id              AS session_id,
        s.status, s.compliant, s.error, s.doc_count,
        s.created_at, s.completed_at,
        s.next_stage, s.awaiting_officer, s.stage_completed_at,
        (SELECT result->'fields'->>'lc_number'
         FROM   lc_v2.pipeline_steps
         WHERE  session_id = s.id AND stage = 'intake' AND step_key = 'lc_parse')
                            AS lc_number,
        (SELECT result->'fields'->>'beneficiary_name'
         FROM   lc_v2.pipeline_steps
         WHERE  session_id = s.id AND stage = 'intake' AND step_key = 'lc_parse')
                            AS beneficiary_name,
        (SELECT result->'fields'->>'applicant_name'
         FROM   lc_v2.pipeline_steps
         WHERE  session_id = s.id AND stage = 'intake' AND step_key = 'lc_parse')
                            AS applicant_name
FROM    lc_v2.check_sessions s;

CREATE OR REPLACE VIEW lc_v2.v_latest_session AS
SELECT * FROM lc_v2.v_session_overview
WHERE  created_at = (SELECT MAX(created_at) FROM lc_v2.check_sessions)
LIMIT 1;
