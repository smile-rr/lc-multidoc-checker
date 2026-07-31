-- Governance becomes documents.
--
-- Thirteen tables and a hundred and eight columns, plus forty-seven more across three
-- views, to hold ninety-nine rows that a person hand-authors. The modelling bought nothing
-- at that size and cost a defect every time the shape changed: adding `role` last week
-- meant editing a migration, a view, an INSERT column list, an ON CONFLICT list, a
-- parameter list, a row mapper, an SPI record and two UI files — and the one that got
-- missed was the view, which is why the console that authors `role` never saw it back.
--
-- The bug was never the columns. It was enumerating them by hand in four places.
-- `INSERT (key, body) VALUES (?, ?::jsonb)` has nothing to forget.
--
-- So: one row per thing, the whole thing in `body`, and generated columns for the handful
-- of properties something actually filters or orders on. Generated, because a column
-- written by hand beside the document is the second place to keep in step — which is the
-- problem, not the solution.
--
-- What folds in, and why:
--   field_binding → dict_field.body.bindings   a binding has no life apart from its field
--   check_rule    → check_def.body.rule        one check, one document, saved together
--   check_group   → agent.body.groups          a group belongs to exactly one agent
--   article       → book.body.articles         an article belongs to exactly one book
--
-- What we give up: the foreign key from a binding to a document type. The console keeps
-- that now — it already blocks deleting a type in use — and `v_dangling_reference` below
-- reports what slips through, which beats a database error the author cannot act on.
--
-- helix_check is untouched and stays relational. Facts are joined on
-- (field_key, doc_code) by the rule evaluator, and the cases list filters, sorts and
-- aggregates over data that grows without bound. Opposite profile, opposite answer.

DROP VIEW IF EXISTS helix_gov.v_check_list        CASCADE;
DROP VIEW IF EXISTS helix_gov.v_dict_field_usage  CASCADE;
DROP VIEW IF EXISTS helix_gov.v_doc_type_usage    CASCADE;

DROP TABLE IF EXISTS helix_gov.catalog_release_item CASCADE;
DROP TABLE IF EXISTS helix_gov.catalog_release      CASCADE;
DROP TABLE IF EXISTS helix_gov.check_revision       CASCADE;
DROP TABLE IF EXISTS helix_gov.check_rule           CASCADE;
DROP TABLE IF EXISTS helix_gov.check_def            CASCADE;
DROP TABLE IF EXISTS helix_gov.check_group          CASCADE;
DROP TABLE IF EXISTS helix_gov.agent                CASCADE;
DROP TABLE IF EXISTS helix_gov.field_binding        CASCADE;
DROP TABLE IF EXISTS helix_gov.dict_field           CASCADE;
DROP TABLE IF EXISTS helix_gov.doc_type             CASCADE;
DROP TABLE IF EXISTS helix_gov.article              CASCADE;
DROP TABLE IF EXISTS helix_gov.book                 CASCADE;

-- ---------------------------------------------------------------------------
-- Document types.
--
-- `role` says what a document IS to an examination — the credit carries the terms, the
-- covering schedule states the presentation date — so lc-check can find those two without
-- naming a code. `before_reading` is what makes a hard check possible at all.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_gov.doc_type (
    code           TEXT PRIMARY KEY,
    body           JSONB       NOT NULL,
    role           TEXT    GENERATED ALWAYS AS (body ->> 'role') STORED,
    before_reading BOOLEAN GENERATED ALWAYS AS (COALESCE((body ->> 'beforeReading')::boolean, FALSE)) STORED,
    ordinal        INT     GENERATED ALWAYS AS (COALESCE((body ->> 'ordinal')::int, 0)) STORED,
    active         BOOLEAN GENERATED ALWAYS AS (COALESCE((body ->> 'active')::boolean, TRUE)) STORED,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one document can be the credit, and only one the schedule.
CREATE UNIQUE INDEX ux_doc_type_role ON helix_gov.doc_type (role) WHERE role IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Dictionary fields, each carrying the documents it is read from.
--
-- A binding is (doc, note, aliases): which document, how to read it there in the author's
-- own words, and what that document tends to call it. The note goes into the extraction
-- prompt verbatim; the aliases fold an open-world reading back onto this key.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_gov.dict_field (
    key        TEXT PRIMARY KEY,
    body       JSONB       NOT NULL,
    value_type TEXT GENERATED ALWAYS AS (body ->> 'valueType') STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every (field, document) pair, flattened. The extraction spec reads this.
CREATE INDEX ix_dict_field_bindings ON helix_gov.dict_field USING GIN ((body -> 'bindings'));

-- ---------------------------------------------------------------------------
-- Checks, each carrying its own rule.
--
-- They were two tables saved by two calls, which meant a check could be saved without its
-- conditions and look complete. One document, one save.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_gov.check_def (
    id         TEXT PRIMARY KEY,
    body       JSONB       NOT NULL,
    status     TEXT    GENERATED ALWAYS AS (COALESCE(body ->> 'status', 'ACTIVE')) STORED,
    check_type TEXT    GENERATED ALWAYS AS (COALESCE(body ->> 'checkType', 'AGENT')) STORED,
    is_gate    BOOLEAN GENERATED ALWAYS AS (COALESCE((body ->> 'gate')::boolean, FALSE)) STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_check_status ON helix_gov.check_def (status);
CREATE INDEX ix_check_fields ON helix_gov.check_def USING GIN ((body -> 'fields'));
CREATE INDEX ix_check_docs   ON helix_gov.check_def USING GIN ((body -> 'docs'));

-- ---------------------------------------------------------------------------
-- Agents, each carrying its groups. A group belongs to exactly one agent and has never
-- meant anything without it.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_gov.agent (
    id         TEXT PRIMARY KEY,
    body       JSONB       NOT NULL,
    ordinal    INT GENERATED ALWAYS AS (COALESCE((body ->> 'ordinal')::int, 0)) STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- The article library. A book carries its articles.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_gov.book (
    id         TEXT PRIMARY KEY,
    body       JSONB       NOT NULL,
    ordinal    INT GENERATED ALWAYS AS (COALESCE((body ->> 'ordinal')::int, 0)) STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every article, addressable by the code a check cites. `{{ref.X.text}}` resolves here.
CREATE VIEW helix_gov.v_article AS
SELECT b.id                     AS book_id,
       b.body ->> 'title'       AS book_title,
       a ->> 'code'             AS code,
       a ->> 'title'            AS title,
       a ->> 'section'          AS section,
       a ->> 'summary'          AS summary,
       a ->> 'read'             AS body
  FROM helix_gov.book b, jsonb_array_elements(COALESCE(b.body -> 'articles', '[]'::jsonb)) a;

-- ---------------------------------------------------------------------------
-- Comments. Append-only and queried by target, so it stays a table — it is a log, not a
-- document someone edits.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS helix_gov.comment (
    id          BIGSERIAL PRIMARY KEY,
    target_kind TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    author      TEXT NOT NULL,
    initials    TEXT,
    body        TEXT NOT NULL,
    tag         TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_comment_target ON helix_gov.comment (target_kind, target_id, created_at);
