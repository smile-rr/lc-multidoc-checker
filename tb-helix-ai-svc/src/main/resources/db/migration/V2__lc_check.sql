-- ============================================================================
-- helix_check — one examination of one presentation against one credit.
--
-- Storage follows one rule: anything a human mutates, or the UI filters on, gets
-- a column. Everything else stays in lc_step.result as JSONB.
--
--   columns   lc_fact         the officer corrects them; every exact rule joins on them
--             lc_plan_check   the officer adds to it; the UI groups by tier and origin
--             lc_finding      every one carries a disposition and a note
--
--   JSONB     segmentation output, MT700 parse, trigger traces, stage results —
--             read back whole, never filtered, so a new stage costs no migration
--
-- Three forces, three shapes, inherited from lc-checker-v2 because they were right:
--
--   the system computes   → lc_step            idempotent, UNIQUE (case, stage, step_key)
--   the stream replays    → lc_event           an append-only tape, seq-ordered
--   the officer decides   → lc_officer_action  append-only; latest wins per target
--
-- What is NOT inherited: a mutable in-memory pipeline context. Every stage reads
-- what it needs from here and the blob store, so any instance can resume any case
-- at any stage after a restart.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS helix_check;


-- ----------------------------------------------------------------------------
-- The case.
--
-- Credit terms are denormalised onto this row on purpose. The cases list needs
-- reference, beneficiary, currency, amount, page count, status and reply-due for
-- every row; without these columns that screen is a fan-out over every case's
-- documents to render a table.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_case (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The handle the officer says out loud and quotes in a refusal advice.
    -- Stable, human, and never the surrogate key.
    case_ref           TEXT        NOT NULL UNIQUE,

    status             TEXT        NOT NULL DEFAULT 'awaiting_check'
                       CHECK (status IN ('awaiting_check', 'running', 'discrepancies',
                                         'to_decide', 'clean', 'with_authoriser')),
    stage              TEXT        NOT NULL DEFAULT 'intake',
    next_stage         TEXT,
    awaiting_officer   BOOLEAN     NOT NULL DEFAULT FALSE,
    stage_completed_at JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Which rulebook this examination is answerable to. Stamped at creation so a
    -- catalogue edited afterwards cannot retroactively change what was checked.
    catalog_release_id UUID,

    -- --- Credit terms, as parsed from the MT700 -----------------------------
    credit_ref         TEXT,
    issued_date        DATE,
    applicant          TEXT,
    beneficiary        TEXT,
    currency           CHAR(3),
    amount             NUMERIC(18,2),
    tolerance_pct      NUMERIC(5,2),
    latest_shipment    DATE,
    expiry             DATE,
    expiry_place       TEXT,
    presentation_days  INT,
    tenor              TEXT,
    goods              TEXT,

    -- --- What arrived -------------------------------------------------------
    credit_text_sha    CHAR(64),   -- blob: the raw lc.txt, byte for byte
    source_bundle_sha  CHAR(64),   -- blob: the original upload (TIFF or PDF). Evidence; never discarded.
    bundle_pdf_sha     CHAR(64),   -- blob: the PDF the viewer renders (== source when a PDF was uploaded)

    presented_date     DATE,
    presenting_bank    TEXT,
    reply_due_date     DATE,
    page_count         INT         NOT NULL DEFAULT 0,
    assigned_to        TEXT,
    authoriser         TEXT,

    -- --- Hard check outcome -------------------------------------------------
    -- A gate failure ends the examination before the expensive half of the run.
    -- Recorded on the case because it changes what the whole case means, not just
    -- what one check concluded.
    gate_halted        BOOLEAN     NOT NULL DEFAULT FALSE,
    gate_halt_check_id TEXT,
    gate_overridden_by TEXT,

    error              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at       TIMESTAMPTZ
);

CREATE INDEX ix_case_status  ON helix_check.lc_case (status);
CREATE INDEX ix_case_created ON helix_check.lc_case (created_at DESC);
CREATE INDEX ix_case_mine    ON helix_check.lc_case (assigned_to, created_at DESC);


-- ----------------------------------------------------------------------------
-- Documents.
--
-- In a deal bundle these are page ranges carved out of one scanned PDF, not
-- separate files — which is why page_from/page_to and pages carry the identity
-- and blob_sha is usually null.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_document (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id              UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    -- mt700 | CS | INV | BOL | PKL | BOE | BC | WC | UNKNOWN. This is the id the
    -- UI addresses a document by, and facts and findings cite.
    doc_code             TEXT        NOT NULL,
    doc_type_code        TEXT,       -- governance doc_type, once classified
    role                 TEXT        NOT NULL CHECK (role IN ('credit', 'presented')),

    doc_type_label       TEXT,       -- 'Commercial invoice'
    abbr                 TEXT,       -- 'IN' — the rail badge
    icon                 TEXT,
    file_name            TEXT,
    reference            TEXT,       -- the document's own number

    page_from            INT,
    page_to              INT,
    -- For a document whose pages are not contiguous. page_from/page_to stay
    -- populated as the span, so a range query needs no array unnest.
    pages                INT[]       NOT NULL DEFAULT '{}',

    extraction_mode      TEXT        CHECK (extraction_mode IN ('text', 'ocr')),
    low_confidence       BOOLEAN     NOT NULL DEFAULT FALSE,
    scan_note            TEXT,       -- what specifically was hard to read
    classification_conf  NUMERIC(4,3),
    confirmed_by_officer BOOLEAN     NOT NULL DEFAULT FALSE,

    blob_sha             CHAR(64),   -- only when the document arrived as its own file
    ordinal              INT         NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, doc_code)
);

CREATE INDEX ix_doc_case ON helix_check.lc_document (case_id, ordinal);


-- The bundle's physical page map: what each scanned page turned out to be.
-- Read on every render of the interpret screen, so it is a table rather than a
-- projection out of lc_step.
CREATE TABLE helix_check.lc_bundle_page (
    case_id  UUID NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    page_no  INT  NOT NULL,
    doc_code TEXT,          -- NULL = covering schedule, or not yet assigned
    label    TEXT NOT NULL,
    PRIMARY KEY (case_id, page_no)
);


-- ----------------------------------------------------------------------------
-- The step tape.
--
-- One row per unit of work the system did. UNIQUE (case, stage, step_key) makes a
-- re-run idempotent: the second attempt updates the first rather than laying down
-- a duplicate, which is what allows a stage to be retried safely.
--
-- step_key conventions:
--   intake/manifest · intake/convert · intake/mt700
--   interpret/segment · interpret/extract:<doc> · interpret/consensus:<doc>
--   gate/<check_id>
--   plan/requirements · plan/select · plan/<check_id>
--   execute/<check_id>
--   signoff/report
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_step (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id        UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    stage          TEXT        NOT NULL,
    step_key       TEXT        NOT NULL DEFAULT '-',
    status         TEXT        NOT NULL
                   CHECK (status IN ('RUNNING', 'OK', 'FAILED', 'SKIPPED', 'NOT_APPLICABLE')),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    duration_ms    BIGINT,
    -- Whether this step was answered from cache, and by which entry. Makes "why
    -- was this run free" answerable from the record instead of from the log.
    cache_hit      BOOLEAN     NOT NULL DEFAULT FALSE,
    derivation_key CHAR(64),
    result         JSONB,
    error          TEXT,
    UNIQUE (case_id, stage, step_key)
);

CREATE INDEX ix_step_case_stage ON helix_check.lc_step (case_id, stage);


-- ----------------------------------------------------------------------------
-- Facts — what was read off a document, and where from.
--
-- UNIQUE (case_id, doc_code, label) is load-bearing. That pair is already the
-- de-facto key everywhere else: the UI groups facts by document and labels them,
-- and an exact rule's operand resolves as (field label, document) — which is
-- exactly why operands that matched on label alone once compared a value with
-- itself across two documents and passed.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_fact (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id        UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    -- 'mt700' | 'INV' | 'schedule'. Not a FK to lc_document: the presentation
    -- date is read off the covering schedule, which is a page rather than a
    -- document, and it must still be a first-class fact.
    doc_code       TEXT        NOT NULL,
    label          TEXT        NOT NULL,
    field_key      TEXT,       -- governance dictionary key, when the label maps to one
    value          TEXT,
    -- Normalised for comparison: ISO dates, plain decimals, trimmed case. Rules
    -- compare this; humans read `value`. Keeping both means a rule never has to
    -- re-parse, and a display never has to un-normalise.
    value_norm     TEXT,
    value_type     TEXT,

    page           INT,        -- presented documents: the viewer turns to it
    anchor_id      TEXT,       -- credit: 'tag-31D', the line the viewer highlights
    source         TEXT        NOT NULL,   -- ':32B:' | 'p.4' | 'covering schedule'
    source_text    TEXT,       -- the raw line it came from

    confidence     TEXT        CHECK (confidence IN ('HIGH', 'MED', 'LOW')),
    flag           TEXT,       -- why a human should look, or NULL when unremarkable
    -- Per-slot values behind the consensus. Kept because "the models disagreed"
    -- is the single most useful thing to know about a doubtful field.
    slot_votes     JSONB,

    corrected_by   TEXT,
    corrected_at   TIMESTAMPTZ,
    original_value TEXT,       -- what the extractor said before a human overrode it

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, doc_code, label)
);

CREATE INDEX ix_fact_case_doc ON helix_check.lc_fact (case_id, doc_code);


-- ----------------------------------------------------------------------------
-- The plan — which checks this credit brings into play.
--
-- `origin` is the grouping the officer sees, because it decides who can answer
-- for a finding:
--   DICTIONARY  a standing rule card, authored in governance, reviewed before it ran
--   CREDIT      a requirement card read out of THIS credit's 46A/47A during the run
--   OFFICER     something a person added
--
-- `tier` is a mark on the row, not a group: exact (an expression over fields,
-- reproducible, free) vs judged (an agent formed a view, and it cost money).
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_plan_check (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    check_id         TEXT        NOT NULL,   -- REQ-41A | COND-47A.1 | USER-07
    check_version    INT,

    origin           TEXT        NOT NULL CHECK (origin IN ('DICTIONARY', 'CREDIT', 'OFFICER')),
    tier             TEXT        NOT NULL CHECK (tier IN ('EXACT', 'JUDGED')),
    check_type       TEXT        CHECK (check_type IN ('PROGRAMMATIC', 'AGENT', 'AGENT_TOOL', 'AGENTIC')),
    is_gate          BOOLEAN     NOT NULL DEFAULT FALSE,
    cited_as         TEXT        CHECK (cited_as IN ('credit', 'practice', 'policy')),

    -- NULL means the trigger was not met — the check did not run. Recorded with a
    -- trace rather than silently omitted, because "we did not check that" is an
    -- answer an examiner has to be able to give.
    area_id          TEXT,
    trigger_trace    JSONB,

    name             TEXT        NOT NULL,
    applies_because  TEXT,
    rule_ref         TEXT,
    severity         TEXT        CHECK (severity IN ('CRITICAL', 'MAJOR', 'MINOR')),
    refs             TEXT[]      NOT NULL DEFAULT '{}',

    rule_def         JSONB,      -- resolved operand rows — exact only
    execution_plan   TEXT,       -- the assembled prompt — judged only

    -- The planner read a demand in the credit and found no rule that tests it.
    -- A gap in the rulebook, surfaced rather than swallowed.
    not_covered      BOOLEAN     NOT NULL DEFAULT FALSE,
    planned_by_llm   BOOLEAN     NOT NULL DEFAULT FALSE,
    added_by_officer BOOLEAN     NOT NULL DEFAULT FALSE,
    added_by         TEXT,

    status           TEXT        NOT NULL DEFAULT 'PLANNED'
                     CHECK (status IN ('PLANNED', 'SKIPPED', 'RUNNING', 'DONE', 'FAILED')),
    ordinal          INT         NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, check_id)
);

CREATE INDEX ix_plan_case_tier ON helix_check.lc_plan_check (case_id, tier, is_gate);
CREATE INDEX ix_plan_case_area ON helix_check.lc_plan_check (case_id, area_id);


-- ----------------------------------------------------------------------------
-- Findings.
--
-- origin, tier and check_type are deliberately NOT repeated here — they are read
-- through plan_check_id. A finding that carried its own copy would drift from the
-- check that produced it, and then two screens would disagree about what kind of
-- thing the officer is looking at.
--
-- An officer-raised finding has no plan check; raised_by_officer is what says so.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_finding (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    finding_ref       TEXT        NOT NULL,   -- 'f-qty' — stable within the case
    plan_check_id     UUID        REFERENCES helix_check.lc_plan_check(id) ON DELETE SET NULL,

    severity          TEXT        NOT NULL
                      CHECK (severity IN ('discrepancy', 'possible', 'clean', 'manual')),
    area              TEXT,
    area_id           TEXT,

    doc_code          TEXT,
    page              INT,
    anchor_id         TEXT,
    credit_anchor_id  TEXT,       -- the line of the credit this is measured against

    title             TEXT        NOT NULL,   -- readable headline
    -- The formal one-liner that goes out in the refusal advice, MT734 field 77J.
    -- Separate from `title` because the wording a bank sends is not the wording an
    -- officer scans a list with.
    statement         TEXT,
    statement_source  TEXT        CHECK (statement_source IN ('derived', 'drafted', 'officer')),

    detail            TEXT,
    expected          TEXT,       -- what the credit required
    quote             TEXT,       -- what the document said
    quote_source      TEXT,
    reason            TEXT,       -- the rule that makes the difference matter

    analysis          JSONB,      -- {requirement, presented, why, options[], confidence}
    comparison        JSONB,      -- per-row outcomes of an exact rule
    failed_row        INT,        -- which condition row failed; authored, never inferred
                                  -- from severity (that blames row 0 on every multi-row rule)
    trace             JSONB,      -- [{key, value}]
    confidence        TEXT        CHECK (confidence IN ('HIGH', 'MED', 'LOW')),

    raised_by_officer BOOLEAN     NOT NULL DEFAULT FALSE,
    raised_by         TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, finding_ref)
);

CREATE INDEX ix_finding_case  ON helix_check.lc_finding (case_id, severity);
CREATE INDEX ix_finding_check ON helix_check.lc_finding (plan_check_id);


-- ----------------------------------------------------------------------------
-- Run economics.
--
-- cache_pct is derived from cached_calls/total_calls, never stored — a stored
-- percentage is a second source of truth that goes stale the moment a step is
-- retried.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_run_step (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      UUID          NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    step_id      TEXT          NOT NULL,
    stage        TEXT          NOT NULL,
    kind         TEXT          NOT NULL CHECK (kind IN ('read', 'plan', 'exact', 'judged')),
    name         TEXT          NOT NULL,
    role         TEXT,
    model_id     TEXT          REFERENCES helix_core.model_price(model_id),
    checks_count INT           NOT NULL DEFAULT 0,
    total_calls  INT           NOT NULL DEFAULT 0,
    cached_calls INT           NOT NULL DEFAULT 0,
    seconds      NUMERIC(9,3)  NOT NULL DEFAULT 0,
    tokens_in    INT           NOT NULL DEFAULT 0,
    tokens_out   INT           NOT NULL DEFAULT 0,
    retries      INT           NOT NULL DEFAULT 0,
    note         TEXT,
    ordinal      INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, step_id)
);


-- ----------------------------------------------------------------------------
-- Officer actions — append-only.
--
-- Nothing here is ever updated or deleted. A disposition changed three times
-- leaves three rows, and the views take the latest. That is what makes the audit
-- trail defensible: it records what the officer did, not what they ended up
-- thinking.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_officer_action (
    case_id    UUID        NOT NULL REFERENCES helix_check.lc_case(id) ON DELETE CASCADE,
    seq        BIGSERIAL,
    action     TEXT        NOT NULL,
    target     TEXT        NOT NULL DEFAULT '-',
    payload    JSONB,
    officer_id TEXT        NOT NULL,
    note       TEXT,
    acted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (case_id, seq)
);

COMMENT ON COLUMN helix_check.lc_officer_action.action IS
    'disposition | finding_note | raise_finding | unraise_finding | add_check | correct_fact | '
    'confirm_doc | reclassify_doc | gate_override | stop_policy | verdict | review_note | '
    'submit | run_stage | rerun_stage';

CREATE INDEX ix_oa_target  ON helix_check.lc_officer_action (case_id, action, target, acted_at DESC);
CREATE INDEX ix_oa_officer ON helix_check.lc_officer_action (officer_id, acted_at DESC);


-- ----------------------------------------------------------------------------
-- The event tape, for SSE replay.
--
-- No foreign key: the first event fires while the case row is still being
-- written, and an event that cannot be recorded because its subject is half-built
-- is worse than an orphan row.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_check.lc_event (
    case_id    UUID        NOT NULL,
    seq        BIGINT      NOT NULL,
    event      JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (case_id, seq)
);
