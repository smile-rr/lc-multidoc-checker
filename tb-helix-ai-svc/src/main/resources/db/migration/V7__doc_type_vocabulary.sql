-- One document vocabulary, authored in Governance.
--
-- There were three spellings of the same document. Governance said COMMERCIAL_INVOICE, the
-- examination said INV, and an exact rule's operand said "Commercial invoice". Nothing
-- joined, and the cost was silent: five of eleven authored checks were skipped on a
-- presentation that contained exactly the documents they asked for, each with a reason that
-- read like a considered judgement —
--
--     PARTY-FC04  SKIPPED  Not run — the credit does not call for COMMERCIAL_INVOICE
--                          or BILL_OF_LADING
--
-- The code is now data an author owns: they type it in the dictionary, and nothing in Java
-- may branch on its value. Short codes are this bank's convention, not the system's rule.
--
-- Everything that cites a document is moved together — bindings, a check's doc_types and
-- operand_docs, and the operand tree inside check_rule.groups, which cited documents by
-- their display name.

ALTER TABLE helix_gov.doc_type
    -- What this document IS to an examination, when it is anything in particular. The
    -- credit carries the terms; the schedule carries the presentation date. lc-check has to
    -- find those two without naming a code, and this is how it asks.
    --
    -- NULL for the rest, which is nearly all of them: an invoice is not special, it is just
    -- a document type someone authored.
    ADD COLUMN IF NOT EXISTS role  TEXT CHECK (role IN ('credit', 'schedule')),
    -- Display and future attributes — abbr, icon, whatever the console grows next. JSONB so
    -- that adding one is an edit in the authoring screen rather than a migration, a column,
    -- a row mapper and a DTO. Nothing examines it.
    ADD COLUMN IF NOT EXISTS attrs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Only one document can be the credit, and only one the schedule.
CREATE UNIQUE INDEX IF NOT EXISTS ux_doc_type_role ON helix_gov.doc_type (role) WHERE role IS NOT NULL;

-- --- The rename ------------------------------------------------------------
--
-- Old code → new code. Applied to every table that cites one. On a fresh database
-- helix_gov is empty at this point and every statement below is a no-op; the seed file
-- already speaks the new codes.

CREATE TEMP TABLE doc_code_move (old TEXT PRIMARY KEY, new TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO doc_code_move (old, new) VALUES
    ('LETTER_OF_CREDIT',         'LC'),
    ('COVERING_SCHEDULE',        'CS'),
    ('DRAFT__BILL_OF_EXCHANGE',  'BOE'),
    ('COMMERCIAL_INVOICE',       'INV'),
    ('BILL_OF_LADING',           'BOL'),
    ('AIR_WAYBILL',              'AWB'),
    ('MULTIMODAL_TRANSPORT_DOC', 'MTD'),
    ('CHARTER_PARTY_B_L',        'CPB'),
    ('INSURANCE_DOCUMENT',       'INS'),
    ('PACKING_LIST',             'PKL'),
    ('CERTIFICATE_OF_ORIGIN',    'COO'),
    ('INSPECTION_CERTIFICATE',   'INSP'),
    ('BENEFICIARY_CERTIFICATE',  'BC'),
    ('TRANSPORT_DOCUMENT',       'TD');

-- field_binding and check_def cite the code directly. The FK is ON UPDATE-less, so the
-- parent moves first and the children follow inside the same transaction.
ALTER TABLE helix_gov.field_binding DROP CONSTRAINT IF EXISTS field_binding_doc_code_fkey;

UPDATE helix_gov.doc_type d SET code = m.new FROM doc_code_move m WHERE d.code = m.old;
UPDATE helix_gov.field_binding b SET doc_code = m.new FROM doc_code_move m WHERE b.doc_code = m.old;

UPDATE helix_gov.check_def c
   SET doc_types    = (SELECT COALESCE(array_agg(COALESCE(m.new, x)), '{}')
                         FROM unnest(c.doc_types) x LEFT JOIN doc_code_move m ON m.old = x),
       operand_docs = (SELECT COALESCE(array_agg(COALESCE(m.new, x)), '{}')
                         FROM unnest(c.operand_docs) x LEFT JOIN doc_code_move m ON m.old = x);

ALTER TABLE helix_gov.field_binding
    ADD CONSTRAINT field_binding_doc_code_fkey
    FOREIGN KEY (doc_code) REFERENCES helix_gov.doc_type(code) ON DELETE CASCADE;

-- An exact rule's operands cited documents by their display NAME, because the authoring
-- screen worked in names. A name is a label — it can be corrected without meaning anything
-- has changed — so it cannot also be the identity.
DO $$
DECLARE d RECORD;
BEGIN
    FOR d IN SELECT code, name FROM helix_gov.doc_type LOOP
        UPDATE helix_gov.check_rule
           SET groups = REPLACE(REPLACE(groups::text,
                   '"doc": "' || d.name || '"', '"doc": "' || d.code || '"'),
                   '"doc":"'  || d.name || '"', '"doc":"'  || d.code || '"')::jsonb
         WHERE groups::text LIKE '%"' || d.name || '"%';
    END LOOP;
END $$;

-- --- Roles, and the one document type the examination needed and nobody authored ---------

UPDATE helix_gov.doc_type SET role = 'credit'   WHERE code = 'LC';
UPDATE helix_gov.doc_type SET role = 'schedule' WHERE code = 'CS';

-- The presentations we examine carry warranty certificates and the classifier has always
-- had a code for one; the dictionary never did, so no field could be bound to it and no
-- check could name it. Inserted rather than seeded because the seeder only runs on an empty
-- catalogue, and this one is not empty.
INSERT INTO helix_gov.doc_type (code, name, description, before_reading, ordinal)
VALUES ('WC', 'Warranty certificate',
        'The beneficiary''s undertaking as to quality, period and scope of the warranty given.',
        FALSE, 90)
ON CONFLICT (code) DO NOTHING;
