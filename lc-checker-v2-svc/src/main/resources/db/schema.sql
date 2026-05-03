-- ============================================================================
-- LC Checker V2 schema — lc_v2
--
-- Key differences from v1 check_sessions:
--   - No hardcoded scalar LC columns (lc_reference, beneficiary, applicant)
--   - Display values queried from extraction_results.fields JSONB by canonical key
--   - One documents row per uploaded file; extraction results per (document × slot)
--   - Explicit per-rule officer confirmation tracking
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS lc_v2;

-- ---------------------------------------------------------------------------
-- Session umbrella — one row per LC examination job
-- No LC-specific scalar columns: display values read from extraction_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.check_sessions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    status          VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',
    -- QUEUED | INTAKE | PARSE | RECONCILE | EXAMINE | SIGNOFF | COMPLETED | FAILED
    compliant       BOOLEAN,
    error           TEXT,
    final_report    JSONB,
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
-- Documents — one row per uploaded document file
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.documents (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id            UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    doc_type              VARCHAR(20)  NOT NULL,   -- LC | INV | BOL | PKL | BOE | BC | WC | UNKNOWN
    original_filename     TEXT,
    file_sha256           CHAR(64),
    page_count            INT,
    parse_status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    -- PENDING | EXTRACTING | EXTRACTED | FAILED
    classification_conf   NUMERIC(4,3),            -- confidence of filename-based classification
    confirmed_by_officer  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_docs_session    ON lc_v2.documents(session_id);
CREATE INDEX IF NOT EXISTS idx_v2_docs_type       ON lc_v2.documents(session_id, doc_type);

-- ---------------------------------------------------------------------------
-- Extraction results — one row per (document × extractor slot)
-- fields JSONB: {field_key: {value, confidence, raw}}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.extraction_results (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID         NOT NULL REFERENCES lc_v2.documents(id) ON DELETE CASCADE,
    session_id        UUID         NOT NULL,
    extractor_slot    VARCHAR(20)  NOT NULL,   -- primary | compare | benchmark
    fields            JSONB        NOT NULL DEFAULT '{}',
    off_schema_items  JSONB        NOT NULL DEFAULT '[]',
    overall_confidence NUMERIC(4,3),
    is_consensus      BOOLEAN      NOT NULL DEFAULT FALSE,  -- true = merged consensus row
    extracted_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_extract_doc     ON lc_v2.extraction_results(document_id);
CREATE INDEX IF NOT EXISTS idx_v2_extract_session ON lc_v2.extraction_results(session_id);
CREATE INDEX IF NOT EXISTS idx_v2_extract_slot    ON lc_v2.extraction_results(session_id, extractor_slot);

-- ---------------------------------------------------------------------------
-- Reconcile state — canonical field pivot + officer triage decisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.reconcile_state (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    locked          BOOLEAN      NOT NULL DEFAULT FALSE,
    locked_at       TIMESTAMP,
    locked_by_officer VARCHAR(100),
    triage          JSONB        NOT NULL DEFAULT '{}',
    -- {field_key: "genuine" | "parse-error" | null}
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (session_id)
);

-- ---------------------------------------------------------------------------
-- Rule confirmations — per-rule officer confirm/reject
-- Every rule result (PASS/NA/DOUBTS/FAIL) requires explicit officer action.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.rule_confirmations (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    rule_id          VARCHAR(50)  NOT NULL,
    system_verdict   VARCHAR(20)  NOT NULL,    -- PASS | FAIL | NOT_APPLICABLE | DOUBTS
    officer_verdict  VARCHAR(20),              -- officer's own verdict (may override system)
    justification    TEXT,                     -- mandatory for DOUBTS/FAIL rejections
    confirmed_at     TIMESTAMP,
    officer_id       VARCHAR(100),
    UNIQUE (session_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_v2_rule_conf_session ON lc_v2.rule_confirmations(session_id);

-- ---------------------------------------------------------------------------
-- Examine overrides — officer inline overrides on individual rule results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.examine_overrides (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    rule_id     VARCHAR(50)  NOT NULL,
    new_status  VARCHAR(20)  NOT NULL,
    reason      VARCHAR(100),
    note        TEXT,
    flagged     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_overrides_session ON lc_v2.examine_overrides(session_id);

-- ---------------------------------------------------------------------------
-- Sign-off — final examiner decision
-- frozen=true means the record is immutable (legal anchor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lc_v2.signoff (
    id                         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id                 UUID         NOT NULL REFERENCES lc_v2.check_sessions(id) ON DELETE CASCADE,
    decision                   VARCHAR(20)  NOT NULL,  -- COMPLIANT | DISCREPANT | WAIVED
    discrepancy_dispositions   JSONB        NOT NULL DEFAULT '[]',
    -- [{rule_id, description, severity, waivable, disposition: waive|refuse, applicant_consent}]
    officer_note               TEXT,
    signed_at                  TIMESTAMP,
    officer_id                 VARCHAR(100),
    frozen                     BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (session_id)
);

-- ---------------------------------------------------------------------------
-- Pipeline steps + events — same pattern as v1
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

CREATE TABLE IF NOT EXISTS lc_v2.pipeline_events (
    session_id  UUID      NOT NULL,
    seq         BIGINT    NOT NULL,
    event       JSONB     NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_v2_pe_session ON lc_v2.pipeline_events(session_id, seq);

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

-- Session overview — display values extracted from consensus JSONB
CREATE OR REPLACE VIEW lc_v2.v_session_overview AS
SELECT  s.id             AS session_id,
        s.status, s.compliant, s.error, s.doc_count,
        s.created_at, s.completed_at,
        -- display scalars read from the LC consensus extraction
        (SELECT er.fields->>'lc_number'
         FROM   lc_v2.documents d
         JOIN   lc_v2.extraction_results er ON er.document_id = d.id AND er.is_consensus
         WHERE  d.session_id = s.id AND d.doc_type = 'LC'
         LIMIT  1) AS lc_number,
        (SELECT er.fields->>'beneficiary_name'
         FROM   lc_v2.documents d
         JOIN   lc_v2.extraction_results er ON er.document_id = d.id AND er.is_consensus
         WHERE  d.session_id = s.id AND d.doc_type = 'LC'
         LIMIT  1) AS beneficiary_name,
        (SELECT er.fields->>'applicant_name'
         FROM   lc_v2.documents d
         JOIN   lc_v2.extraction_results er ON er.document_id = d.id AND er.is_consensus
         WHERE  d.session_id = s.id AND d.doc_type = 'LC'
         LIMIT  1) AS applicant_name
FROM    lc_v2.check_sessions s;

-- Latest session shortcut
CREATE OR REPLACE VIEW lc_v2.v_latest_session AS
SELECT * FROM lc_v2.v_session_overview
WHERE created_at = (SELECT MAX(created_at) FROM lc_v2.check_sessions)
LIMIT 1;

-- Rule confirmation summary per session
CREATE OR REPLACE VIEW lc_v2.v_rule_confirmations AS
SELECT  rc.session_id,
        rc.rule_id,
        rc.system_verdict,
        rc.officer_verdict,
        rc.justification,
        rc.confirmed_at,
        rc.officer_id,
        CASE WHEN rc.officer_verdict IS NOT NULL THEN 'CONFIRMED' ELSE 'PENDING' END AS confirmation_status
FROM    lc_v2.rule_confirmations rc
ORDER BY rc.session_id, rc.rule_id;
