-- ============================================================================
-- helix_gov — the rulebook.
--
-- Governance authors what the examination runs on. lc-check never writes here; it
-- pins a catalog_release and reads that, so the rule that ran is the rule as it
-- stood when it ran.
--
-- Four groups:
--   vocabulary   doc_type · dict_field · field_binding · book · article
--                A check cannot name a field or cite a clause that does not exist
--                here. That constraint is what makes the dictionary worth having.
--   authoring    agent · check_group · check_def · check_rule · check_revision
--   discussion   comment
--   publishing   catalog_release · catalog_release_item
--
-- Deferred until the import feature is built: import_batch, raw_rule,
-- raw_rule_disposition, check_link. Creating them now would be creating tables
-- whose shape is a guess about a feature nobody has specified.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS helix_gov;


-- ============================================================================
-- Vocabulary
-- ============================================================================

CREATE TABLE helix_gov.doc_type (
    code           TEXT        PRIMARY KEY,   -- LETTER_OF_CREDIT, COMMERCIAL_INVOICE
    name           TEXT        NOT NULL,
    name_zh        TEXT,
    description    TEXT,
    -- Available before the presentation has been examined — the credit itself and
    -- the covering schedule, and nothing else.
    --
    -- This one flag is what makes a hard check possible. Whether a rule CAN run
    -- first is not the author's opinion; it follows from where its operands are
    -- read. A rule that reads the bill of lading cannot run before the bill of
    -- lading has been read, and no amount of intent changes that.
    before_reading BOOLEAN     NOT NULL DEFAULT FALSE,
    ordinal        INT         NOT NULL DEFAULT 0,
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE helix_gov.dict_field (
    key           TEXT        PRIMARY KEY,   -- latest_shipment_date
    name          TEXT        NOT NULL,
    name_zh       TEXT,
    kind          TEXT        NOT NULL DEFAULT 'LC_FIELD'
                  CHECK (kind IN ('LC_FIELD', 'DOC_DATA_POINT', 'DERIVED', 'EXTERNAL')),
    value_type    TEXT,       -- STRING | DATE | AMOUNT | INTEGER | TABLE
    field_group   TEXT,       -- header | amount | parties | shipment | documents | meta
    source_tags   TEXT[]      NOT NULL DEFAULT '{}',   -- SWIFT tags: {44C}
    rule_relevant BOOLEAN     NOT NULL DEFAULT TRUE,
    description   TEXT,
    -- FALSE means hand-authored, and a reseed must leave it alone. Without this
    -- the first reseed silently deletes everything a human added.
    seeded        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_dict_tags ON helix_gov.dict_field USING GIN (source_tags);


-- A field as read from one named document, with the instruction for that pair.
--
-- The note is not documentation — it is what the extraction prompt for that
-- document is built from ('Tag 31D — first six digits, YYMMDD'). Which is why the
-- binding is a row with a note rather than an array of document codes: the same
-- field is read differently off an invoice than off a bill of lading.
CREATE TABLE helix_gov.field_binding (
    field_key TEXT NOT NULL REFERENCES helix_gov.dict_field(key) ON DELETE CASCADE,
    doc_code  TEXT NOT NULL REFERENCES helix_gov.doc_type(code) ON DELETE CASCADE,
    note      TEXT,
    ordinal   INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (field_key, doc_code)
);

CREATE INDEX ix_binding_doc ON helix_gov.field_binding (doc_code);


-- The Library: UCP 600, ISBP 821, or an internal handbook.
CREATE TABLE helix_gov.book (
    id         TEXT        PRIMARY KEY,   -- UCP600, ISBP821
    name       TEXT        NOT NULL,
    subtitle   TEXT,
    kind       TEXT        NOT NULL DEFAULT 'STANDARD'
               CHECK (kind IN ('STANDARD', 'INTERNAL')),
    edition    TEXT,
    ordinal    INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE helix_gov.article (
    id         TEXT        PRIMARY KEY,   -- UCP-14-b, ISBP-A19
    book_id    TEXT        NOT NULL REFERENCES helix_gov.book(id) ON DELETE CASCADE,
    -- How a check cites it: 'UCP600 Art.14'. Distinct from id because the citation
    -- is what appears in a refusal advice and must read as an examiner would write it.
    code       TEXT        NOT NULL,
    section    TEXT,
    article    TEXT,
    paragraph  TEXT,
    heading    TEXT,
    summary    TEXT,
    -- The full text. This is what {{ref.<id>.text}} resolves to when a judged
    -- rule's prompt is assembled, which is why the article text lives in the
    -- database rather than being quoted into each prompt: one place to correct.
    body       TEXT        NOT NULL,
    ordinal    INT         NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_article_book        ON helix_gov.article (book_id, ordinal);
CREATE UNIQUE INDEX ux_article_code ON helix_gov.article (code);


-- ============================================================================
-- Authoring
-- ============================================================================

-- A domain agent: the reviewer persona a group of checks belongs to.
CREATE TABLE helix_gov.agent (
    id          TEXT        PRIMARY KEY,   -- expiry, transport
    name        TEXT        NOT NULL,
    category    TEXT,
    domain_id   TEXT,
    eyebrow     TEXT,
    summary     TEXT,
    description TEXT,
    behavior    TEXT,
    owner       TEXT,
    version     TEXT,
    status      TEXT        NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    icon        TEXT,
    accent      TEXT,
    -- holistic, order, lcFields[], docTypes[], guidance[], anchors[], tools[].
    -- JSONB because this is the agent's own configuration, edited and saved as one
    -- unit, and nothing queries inside it.
    config      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ordinal     INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Grouping within an agent. Ordinal is the sequence the officer sees.
CREATE TABLE helix_gov.check_group (
    id          TEXT        PRIMARY KEY,   -- AVAILABILITY_RISK
    agent_id    TEXT        NOT NULL REFERENCES helix_gov.agent(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    ordinal     INT         NOT NULL DEFAULT 0
);

CREATE INDEX ix_group_agent ON helix_gov.check_group (agent_id, ordinal);


-- The authored unit.
CREATE TABLE helix_gov.check_def (
    id             TEXT        PRIMARY KEY,   -- REQ-41A, DATE-31D
    version        INT         NOT NULL DEFAULT 1,
    status         TEXT        NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    agent_id       TEXT        REFERENCES helix_gov.agent(id) ON DELETE SET NULL,
    group_id       TEXT        REFERENCES helix_gov.check_group(id) ON DELETE SET NULL,
    domain         TEXT,       -- 'Time & availability'

    title          TEXT        NOT NULL,
    -- Plain language with {field} tokens. For a judged check this IS the prompt —
    -- not a description of one — which is why it is text rather than a structure.
    body           TEXT        NOT NULL,
    suggestion     TEXT,

    severity       TEXT        NOT NULL DEFAULT 'MAJOR'
                   CHECK (severity IN ('CRITICAL', 'MAJOR', 'MINOR')),
    -- The execution tier, escalating in cost and autonomy. PROGRAMMATIC is the
    -- exact tier; the other three are judged.
    check_type     TEXT        NOT NULL DEFAULT 'AGENT'
                   CHECK (check_type IN ('PROGRAMMATIC', 'AGENT', 'AGENT_TOOL', 'AGENTIC')),

    -- The author's assertion that a failure should end the examination. Eligibility
    -- is derived (see operand_docs); this is the part that is genuinely a decision.
    is_gate        BOOLEAN     NOT NULL DEFAULT FALSE,
    cited_as       TEXT        CHECK (cited_as IN ('credit', 'practice', 'policy')),

    refs           TEXT[]      NOT NULL DEFAULT '{}',   -- article.code
    field_refs     TEXT[]      NOT NULL DEFAULT '{}',   -- dict_field.key
    doc_types      TEXT[]      NOT NULL DEFAULT '{}',   -- doc_type.code

    -- Derived on save from the rule's operands, so gate eligibility is a plain SQL
    -- predicate rather than a per-request walk of the condition tree:
    --
    --   eligible = check_type = 'PROGRAMMATIC'
    --              AND check_rule has rows
    --              AND operand_docs ⊆ (SELECT code FROM doc_type WHERE before_reading)
    --
    -- Denormalised deliberately: it is a projection of check_rule.groups, rewritten
    -- by the same transaction that writes them, never edited by hand.
    operand_docs   TEXT[]      NOT NULL DEFAULT '{}',

    max_iterations INT,        -- per-rule override of the agentic turn budget
    cases_count    INT         NOT NULL DEFAULT 0,   -- usage counter, written by lc-check

    authored_by    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_check_fields ON helix_gov.check_def USING GIN (field_refs);
CREATE INDEX ix_check_docs   ON helix_gov.check_def USING GIN (doc_types);
CREATE INDEX ix_check_group  ON helix_gov.check_def (group_id, id);
CREATE INDEX ix_check_agent  ON helix_gov.check_def (agent_id);
CREATE INDEX ix_check_gate   ON helix_gov.check_def (is_gate) WHERE is_gate;


-- An exact check's conditions.
--
-- JSONB because the editor loads, edits and saves the whole tree as one unit and
-- nothing queries an individual row. The one thing that IS queried — which
-- documents the operands read — is projected onto check_def.operand_docs by the
-- same write, so the query path never has to open this column.
--
-- Shape:
--   [{ id, logic: 'all'|'any', connector: 'AND'|'OR',
--      rows: [{ id, l: {field,doc}|{literal}, op, r: {…}, tol }] }]
CREATE TABLE helix_gov.check_rule (
    check_id   TEXT        PRIMARY KEY REFERENCES helix_gov.check_def(id) ON DELETE CASCADE,
    scope      TEXT,       -- 'Every presentation' — when this rule applies at all
    message    TEXT,       -- the wording of the discrepancy when it fails
    groups     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Append-only history of the authored unit.
--
-- Editing a live check is the highest-risk action in the system: it silently
-- changes what every future examination concludes. What changed, who changed it,
-- and what it was before must all survive.
CREATE TABLE helix_gov.check_revision (
    check_id    TEXT        NOT NULL REFERENCES helix_gov.check_def(id) ON DELETE CASCADE,
    version     INT         NOT NULL,
    snapshot    JSONB       NOT NULL,   -- check_def + check_rule as they then stood
    change_note TEXT,
    changed_by  TEXT,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (check_id, version)
);


-- ============================================================================
-- Discussion
-- ============================================================================

CREATE TABLE helix_gov.comment (
    id          BIGSERIAL   PRIMARY KEY,
    target_kind TEXT        NOT NULL CHECK (target_kind IN ('CHECK', 'GROUP', 'AGENT', 'ARTICLE')),
    target_id   TEXT        NOT NULL,
    author      TEXT        NOT NULL,
    initials    TEXT,
    body        TEXT        NOT NULL,
    tag         TEXT,       -- 'Sent for review' | 'Adjustment requested'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_comment_target ON helix_gov.comment (target_kind, target_id, created_at);


-- ============================================================================
-- Publishing — what an examination is answerable to
-- ============================================================================

CREATE TABLE helix_gov.catalog_release (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    version      TEXT        NOT NULL UNIQUE,   -- 2026-07-30.1
    notes        TEXT,
    published_by TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- The snapshot is the point. A case pins a release, and execution reads these
-- frozen rows rather than live check_def — so a rule edited next month cannot
-- change what last month's examination is recorded as having checked.
CREATE TABLE helix_gov.catalog_release_item (
    release_id    UUID  NOT NULL REFERENCES helix_gov.catalog_release(id) ON DELETE CASCADE,
    check_id      TEXT  NOT NULL,
    check_version INT   NOT NULL,
    snapshot      JSONB NOT NULL,
    PRIMARY KEY (release_id, check_id)
);
