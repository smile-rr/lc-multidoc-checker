-- One collection.
--
-- V9 made each kind of thing a document but kept five tables and eight generated
-- columns — role, before_reading, ordinal, active, status, check_type, is_gate,
-- value_type. That was a smaller copy of the problem V9 removed: eight column
-- definitions to maintain, each one a second place that has to be edited when an
-- attribute is added, and each one silently NULL the day somebody renames a key in the
-- document.
--
-- They were not even earning it. Of the eight, exactly three were read from a base
-- table — doc_type's role and before_reading, and ordinal for sorting. The other five
-- were reached through views that compute the same thing from the body anyway. And at
-- ninety-nine rows no index has ever changed a plan; the columns bought query
-- readability, which is what a view is for.
--
-- So: one table, a kind, an id and a document. Adding a sixth kind of thing is a row,
-- not a migration. The views below are the readable surface — a caller still writes
-- `WHERE status <> 'RETIRED'`, it just resolves against a view instead of a column.
--
-- What stays relational, and why it is not a document:
--
--   comment   an append-only log. It is written once and never edited, queried by
--             target rather than read whole, and grows without bound. Everything that
--             makes a document the right shape for the catalogue is false of it.

CREATE TABLE helix_gov.document (
    kind       TEXT        NOT NULL,   -- doc_type | field | check | agent | book
    id         TEXT        NOT NULL,
    body       JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, id)
);

-- Containment, for the two places that ask "which checks name this field / document".
CREATE INDEX ix_document_body ON helix_gov.document USING GIN (body jsonb_path_ops);

INSERT INTO helix_gov.document (kind, id, body, updated_at)
SELECT 'doc_type', code, body, updated_at FROM helix_gov.doc_type
UNION ALL SELECT 'field', key, body, updated_at FROM helix_gov.dict_field
UNION ALL SELECT 'check', id,  body, updated_at FROM helix_gov.check_def
UNION ALL SELECT 'agent', id,  body, updated_at FROM helix_gov.agent
UNION ALL SELECT 'book',  id,  body, updated_at FROM helix_gov.book;

-- There is no draft and no version in this design. Pressing Save is the whole
-- ceremony, so a check either runs or has been stood down — and a check that had been
-- saved was coming back marked Draft with no way out of it.
UPDATE helix_gov.document
   SET body = body - 'status'
 WHERE kind = 'check' AND body ->> 'status' = 'DRAFT';

DROP VIEW  IF EXISTS helix_gov.v_check_list        CASCADE;
DROP VIEW  IF EXISTS helix_gov.v_field_binding     CASCADE;
DROP VIEW  IF EXISTS helix_gov.v_dangling_reference CASCADE;
DROP VIEW  IF EXISTS helix_gov.v_dict_field_usage  CASCADE;
DROP VIEW  IF EXISTS helix_gov.v_doc_type_usage    CASCADE;
DROP VIEW  IF EXISTS helix_gov.v_article           CASCADE;

DROP TABLE IF EXISTS helix_gov.check_def  CASCADE;
DROP TABLE IF EXISTS helix_gov.dict_field CASCADE;
DROP TABLE IF EXISTS helix_gov.doc_type   CASCADE;
DROP TABLE IF EXISTS helix_gov.agent      CASCADE;
DROP TABLE IF EXISTS helix_gov.book       CASCADE;
