-- ============================================================================
-- LC Governance schema — lc_gov
--
-- Governance owns the rules the examination runs on. LC Check does not write
-- here; it pins a published catalog_release and reads that.
--
-- Four groups of tables, in dependency order:
--
--   vocabulary   doc_type · dict_field · book · article
--                Seeded from YAML on boot. A check cannot name a field or a
--                clause that does not exist here — which is also what makes
--                the structural signature computable.
--
--   authoring    agent · check_group · check_def · check_revision
--                check_def is the authored unit. `body` is plain language with
--                {field} tokens — it IS the prompt (design doc §2.3), so it is
--                text, not an expression tree.
--
--   difference   check_link
--                Duplicate / overlap / sibling verdicts between two checks.
--                Deterministic candidates first (signature + array overlap);
--                semantic and LLM signals attach to the same table later.
--
--   intake       import_batch · raw_rule · raw_rule_disposition
--                An uploaded human checklist. raw_rule is IMMUTABLE (§5.1):
--                normalization will be re-run, and it can only be re-run if
--                the original survives.
--
--   publishing   catalog_release · catalog_release_item
--
-- No pgvector here. At a few hundred checks the deterministic signals below
-- carry the dedup load; embeddings arrive with the semantic slice, and the
-- image must move to pgvector/pgvector:pg16 before they do.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS lc_gov;

-- ============================================================================
-- Vocabulary — seeded, idempotent. Governance owns it; the checker still has
-- its own copy of these YAMLs until the cutover.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lc_gov.doc_type (
    code            TEXT PRIMARY KEY,               -- LC, INV, BOL, PKL, BOE, BC, WC
    name_en         TEXT NOT NULL,
    name_zh         TEXT,
    description     TEXT,
    ordinal         INT  NOT NULL DEFAULT 0
);

-- The Dictionary. `kind` mirrors the four the governance UI shows; everything
-- seeded from field-pool.yaml is an LC_FIELD or DOC_DATA_POINT, and DERIVED /
-- EXTERNAL entries are authored by hand.
CREATE TABLE IF NOT EXISTS lc_gov.dict_field (
    key             TEXT PRIMARY KEY,               -- canonical key: latest_shipment_date
    name_en         TEXT NOT NULL,
    name_zh         TEXT,
    kind            TEXT NOT NULL DEFAULT 'LC_FIELD'
                    CHECK (kind IN ('LC_FIELD','DOC_DATA_POINT','DERIVED','EXTERNAL')),
    value_type      TEXT,                           -- STRING, DATE, AMOUNT, INTEGER, …
    field_group     TEXT,                           -- header|amount|parties|shipment|…
    source_tags     TEXT[] NOT NULL DEFAULT '{}',   -- SWIFT tags: {44C}
    applies_to      TEXT[] NOT NULL DEFAULT '{}',   -- doc_type codes
    rule_relevant   BOOLEAN NOT NULL DEFAULT TRUE,
    description     TEXT,
    seeded          BOOLEAN NOT NULL DEFAULT FALSE  -- false = hand-authored, survives reseed
);

CREATE INDEX IF NOT EXISTS ix_dict_field_tags ON lc_gov.dict_field USING GIN (source_tags);

-- The Library. A book is UCP 600, ISBP 821, or an internal handbook imported
-- from PDF; an article is one citable unit.
CREATE TABLE IF NOT EXISTS lc_gov.book (
    id              TEXT PRIMARY KEY,               -- UCP600, ISBP821
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'STANDARD'
                    CHECK (kind IN ('STANDARD','INTERNAL')),
    edition         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lc_gov.article (
    id              TEXT PRIMARY KEY,               -- UCP-14-b, ISBP-A19
    book_id         TEXT NOT NULL REFERENCES lc_gov.book(id) ON DELETE CASCADE,
    article         TEXT,
    paragraph       TEXT,
    heading         TEXT,
    body            TEXT NOT NULL,
    ordinal         INT  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_article_book ON lc_gov.article (book_id, ordinal);

-- ============================================================================
-- Authoring
-- ============================================================================

-- A domain agent: the reviewer persona a group of checks belongs to.
CREATE TABLE IF NOT EXISTS lc_gov.agent (
    id              TEXT PRIMARY KEY,               -- expiry, transport
    name            TEXT NOT NULL,
    category        TEXT,
    domain_id       TEXT,                           -- EXPIRY_AVAILABILITY
    summary         TEXT,
    description     TEXT,
    owner           TEXT,
    version         TEXT,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
    icon            TEXT,
    accent          TEXT,
    ordinal         INT  NOT NULL DEFAULT 0
);

-- Grouping within an agent. This is the hierarchy the SIBLING verdict grows
-- (§6.2): a taxonomy elicited from authoring, not designed up front.
CREATE TABLE IF NOT EXISTS lc_gov.check_group (
    id              TEXT PRIMARY KEY,               -- AVAILABILITY_RISK
    agent_id        TEXT NOT NULL REFERENCES lc_gov.agent(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    ordinal         INT  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_check_group_agent ON lc_gov.check_group (agent_id, ordinal);

-- The authored unit.
--
-- signature = (doc_types, field_refs, comparison_nature) — §6.2(a). Stored
-- denormalised as arrays plus a hash so both the exact-match probe and the
-- partial-overlap probe are plain SQL with a GIN index behind them.
CREATE TABLE IF NOT EXISTS lc_gov.check_def (
    id                  TEXT PRIMARY KEY,           -- REQ-41A, DATE-01
    version             INT  NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','ACTIVE','DEPRECATED')),
    parent_id           TEXT REFERENCES lc_gov.check_def(id) ON DELETE SET NULL,
    agent_id            TEXT REFERENCES lc_gov.agent(id) ON DELETE SET NULL,
    group_id            TEXT REFERENCES lc_gov.check_group(id) ON DELETE SET NULL,

    title               TEXT NOT NULL,
    body                TEXT NOT NULL,              -- plain language, {field} tokens — the prompt
    original_text       TEXT,                       -- §P4: the author's words, never overwritten
    severity            TEXT NOT NULL DEFAULT 'MAJOR'
                        CHECK (severity IN ('CRITICAL','MAJOR','MINOR')),
    tier                TEXT NOT NULL DEFAULT 'AGENT'
                        CHECK (tier IN ('PROGRAMMATIC','AGENT','AGENT_TOOL','AGENTIC')),

    doc_types           TEXT[] NOT NULL DEFAULT '{}',
    field_refs          TEXT[] NOT NULL DEFAULT '{}',   -- must exist in dict_field
    clause_refs         TEXT[] NOT NULL DEFAULT '{}',   -- must exist in article
    comparison_nature   TEXT
                        CHECK (comparison_nature IN (
                            'NUMERIC_COMPARE','TEXT_CONSISTENCY','EXISTENCE_CHECK',
                            'DATE_SEQUENCE','CLAUSE_REFERENCE','SEMANTIC_JUDGEMENT')),
    signature_hash      TEXT,                       -- sha256 of the normalised triple

    trigger_summary     TEXT,                       -- §5.3 Phase 2 routing: reserved, unpopulated
    authored_by         TEXT,
    domain_reviewed     BOOLEAN NOT NULL DEFAULT FALSE,   -- a marker, not a gate
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_check_signature  ON lc_gov.check_def (signature_hash);
CREATE INDEX IF NOT EXISTS ix_check_fields     ON lc_gov.check_def USING GIN (field_refs);
CREATE INDEX IF NOT EXISTS ix_check_doc_types  ON lc_gov.check_def USING GIN (doc_types);
CREATE INDEX IF NOT EXISTS ix_check_group      ON lc_gov.check_def (group_id);
CREATE INDEX IF NOT EXISTS ix_check_parent     ON lc_gov.check_def (parent_id);

-- Append-only history. EXTEND (§6.8) is the highest-risk action in the system:
-- what changed, who changed it, and what it was before must all survive.
CREATE TABLE IF NOT EXISTS lc_gov.check_revision (
    check_id        TEXT NOT NULL REFERENCES lc_gov.check_def(id) ON DELETE CASCADE,
    version         INT  NOT NULL,
    snapshot        JSONB NOT NULL,                 -- the whole check_def row as it then stood
    change_note     TEXT,
    changed_by      TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (check_id, version)
);

-- ============================================================================
-- Difference — duplicate / overlap detection between two checks (§6.2)
--
-- One row per ordered pair per signal. A CANDIDATE is machine-proposed; an
-- author promotes it to CONFIRMED or DISMISSED. Dismissals matter as much as
-- confirmations: without them the same pair is re-proposed on every scan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lc_gov.check_link (
    id              BIGSERIAL PRIMARY KEY,
    from_check_id   TEXT NOT NULL REFERENCES lc_gov.check_def(id) ON DELETE CASCADE,
    to_check_id     TEXT NOT NULL REFERENCES lc_gov.check_def(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL
                    CHECK (link_type IN ('TRUE_DUPLICATE','OVERLAPPING','SIBLING','DISTINCT')),
    signal          TEXT NOT NULL
                    CHECK (signal IN ('SIGNATURE','FIELD_OVERLAP','SEMANTIC','LLM','HUMAN')),
    score           NUMERIC(5,4),
    rationale       TEXT,
    status          TEXT NOT NULL DEFAULT 'CANDIDATE'
                    CHECK (status IN ('CANDIDATE','CONFIRMED','DISMISSED')),
    decided_by      TEXT,
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_link_not_self CHECK (from_check_id <> to_check_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_check_link_pair
    ON lc_gov.check_link (from_check_id, to_check_id, signal);
CREATE INDEX IF NOT EXISTS ix_check_link_open
    ON lc_gov.check_link (status) WHERE status = 'CANDIDATE';

-- ============================================================================
-- Intake — an uploaded human checklist
-- ============================================================================

CREATE TABLE IF NOT EXISTS lc_gov.import_batch (
    id              UUID PRIMARY KEY,
    filename        TEXT NOT NULL,
    source_format   TEXT NOT NULL CHECK (source_format IN ('CSV','XLSX','MD','JSON')),
    uploaded_by     TEXT,
    row_count       INT  NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'PARSED'
                    CHECK (status IN ('PARSED','NORMALIZED','TRIAGED','CLOSED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IMMUTABLE. Nothing updates this table.
CREATE TABLE IF NOT EXISTS lc_gov.raw_rule (
    id              UUID PRIMARY KEY,
    batch_id        UUID NOT NULL REFERENCES lc_gov.import_batch(id) ON DELETE CASCADE,
    row_no          INT  NOT NULL,
    rule_name       TEXT,
    rule_desc       TEXT,
    extra           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- any other columns, verbatim
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_raw_rule_batch ON lc_gov.raw_rule (batch_id, row_no);

-- What became of each uploaded row. One row per raw_rule per normalizer run,
-- so a re-run with a better prompt can be diffed against the last.
CREATE TABLE IF NOT EXISTS lc_gov.raw_rule_disposition (
    id                  BIGSERIAL PRIMARY KEY,
    raw_rule_id         UUID NOT NULL REFERENCES lc_gov.raw_rule(id) ON DELETE CASCADE,
    check_id            TEXT REFERENCES lc_gov.check_def(id) ON DELETE SET NULL,
    disposition         TEXT NOT NULL
                        CHECK (disposition IN ('NEW','MERGED','DUPLICATE','SIBLING','SKIPPED','UNRESOLVED')),
    normalizer_version  TEXT NOT NULL,
    proposed            JSONB,                      -- the normalizer's structured output
    confidence          NUMERIC(5,4),
    ambiguities         TEXT[] NOT NULL DEFAULT '{}',   -- §P4: surfaced, never resolved inline
    decided_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_disposition_raw ON lc_gov.raw_rule_disposition (raw_rule_id);

-- ============================================================================
-- Publishing — what LC Check pins
-- ============================================================================

CREATE TABLE IF NOT EXISTS lc_gov.catalog_release (
    id              UUID PRIMARY KEY,
    version         TEXT NOT NULL UNIQUE,           -- 2026-07-27.1
    notes           TEXT,
    published_by    TEXT,
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lc_gov.catalog_release_item (
    release_id      UUID NOT NULL REFERENCES lc_gov.catalog_release(id) ON DELETE CASCADE,
    check_id        TEXT NOT NULL,
    check_version   INT  NOT NULL,
    snapshot        JSONB NOT NULL,
    PRIMARY KEY (release_id, check_id)
);

-- ============================================================================
-- Views
-- ============================================================================

-- A check with its group, agent and evidence count — the Checks list.
CREATE OR REPLACE VIEW lc_gov.v_check_list AS
SELECT c.id, c.version, c.status, c.title, c.severity, c.tier,
       c.doc_types, c.field_refs, c.clause_refs, c.comparison_nature,
       c.parent_id, c.group_id, g.name AS group_name,
       c.agent_id, a.name AS agent_name, a.category AS agent_category,
       (SELECT COUNT(*) FROM lc_gov.raw_rule_disposition d
         WHERE d.check_id = c.id)                       AS source_rows,
       (SELECT COUNT(*) FROM lc_gov.check_link l
         WHERE l.status = 'CANDIDATE'
           AND (l.from_check_id = c.id OR l.to_check_id = c.id)) AS open_links,
       c.updated_at
FROM lc_gov.check_def c
LEFT JOIN lc_gov.check_group g ON g.id = c.group_id
LEFT JOIN lc_gov.agent       a ON a.id = c.agent_id;

-- Open difference candidates, both directions resolved to titles so the review
-- queue needs no second query.
CREATE OR REPLACE VIEW lc_gov.v_open_links AS
SELECT l.id, l.link_type, l.signal, l.score, l.rationale, l.created_at,
       l.from_check_id, f.title AS from_title, f.status AS from_status,
       l.to_check_id,   t.title AS to_title,   t.status AS to_status
FROM lc_gov.check_link l
JOIN lc_gov.check_def f ON f.id = l.from_check_id
JOIN lc_gov.check_def t ON t.id = l.to_check_id
WHERE l.status = 'CANDIDATE';
