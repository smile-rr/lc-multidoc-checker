-- A field key becomes a key.
--
-- `dict_field.key` held the label — "Expiry date", "On-board date" — and was also the
-- identity every check, binding and operand joined on. That is the same mistake the document
-- vocabulary had: a label is something an author may correct, so it cannot also be the thing
-- everything cites. Renaming "Drawee" to "Drawee bank" would silently unbind it.
--
-- It also made the join to a fact impossible to reason about. The examination writes facts
-- under whatever the model called a field — `l_c_no`, `nett_weight`, `our_ref_no` — and the
-- dictionary held `Expiry date`. 105 distinct keys against 22 fields, and 7 matches by pure
-- coincidence of capitalisation.
--
-- So: key is a slug, name is the label, and nothing joins on the label.

-- --- Per-binding aliases ----------------------------------------------------
--
-- What this field is called ON THIS DOCUMENT. An invoice says "total", "grand total",
-- "amount due"; a draft says "amount". The predecessor kept one global alias map and had to
-- reject a second field claiming an alias already taken — so `date` could mean exactly one
-- thing across every document type, forever. A binding already knows which document it is
-- talking about, so it is the right place to say what the field is called there.
ALTER TABLE helix_gov.field_binding
    ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- --- The slug ---------------------------------------------------------------

CREATE TEMP TABLE field_key_move (old TEXT PRIMARY KEY, new TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO field_key_move (old, new)
SELECT key,
       -- lower, non-alphanumeric to underscore, collapsed, trimmed. "On-board date" reads
       -- on_board_date; "Draft tenor" reads draft_tenor.
       trim(both '_' from regexp_replace(lower(key), '[^a-z0-9]+', '_', 'g'))
  FROM helix_gov.dict_field;

-- A collision would silently merge two fields into one. Better to fail the migration.
DO $$
DECLARE dup TEXT;
BEGIN
    SELECT new INTO dup FROM field_key_move GROUP BY new HAVING count(*) > 1 LIMIT 1;
    IF dup IS NOT NULL THEN
        RAISE EXCEPTION 'Two dictionary fields slug to the same key: %', dup;
    END IF;
END $$;

ALTER TABLE helix_gov.field_binding DROP CONSTRAINT IF EXISTS field_binding_field_key_fkey;

UPDATE helix_gov.dict_field f SET key = m.new FROM field_key_move m WHERE f.key = m.old;
UPDATE helix_gov.field_binding b SET field_key = m.new FROM field_key_move m WHERE b.field_key = m.old;

UPDATE helix_gov.check_def c
   SET field_refs = (SELECT COALESCE(array_agg(COALESCE(m.new, x)), '{}')
                       FROM unnest(c.field_refs) x LEFT JOIN field_key_move m ON m.old = x);

ALTER TABLE helix_gov.field_binding
    ADD CONSTRAINT field_binding_field_key_fkey
    FOREIGN KEY (field_key) REFERENCES helix_gov.dict_field(key) ON DELETE CASCADE;

-- An exact rule's operands named the field by label, for the same reason its documents did.
DO $$
DECLARE m RECORD;
BEGIN
    FOR m IN SELECT old, new FROM field_key_move LOOP
        UPDATE helix_gov.check_rule
           SET groups = REPLACE(REPLACE(groups::text,
                   '"field": "' || m.old || '"', '"field": "' || m.new || '"'),
                   '"field":"'  || m.old || '"', '"field":"'  || m.new || '"')::jsonb
         WHERE groups::text LIKE '%"' || m.old || '"%';
    END LOOP;
END $$;

-- `check_def.body` keeps its {Expiry date} tokens. That is prose a model reads, and a
-- prompt reads better in English than in slugs — the machine reference is field_refs.

-- --- What a value is --------------------------------------------------------
--
-- Data, stated rather than inferred. A rule comparing two dates has to know they are dates;
-- deriving that from a key ending in "_date" would be another hidden rule in code, which is
-- the thing being removed. An author can change any of these in the console.

UPDATE helix_gov.dict_field SET value_type = v.t FROM (VALUES
    ('expiry_date',           'DATE'),
    ('latest_shipment_date',  'DATE'),
    ('on_board_date',         'DATE'),
    ('presentation_date',     'DATE'),
    ('cover_date',            'DATE'),
    ('credit_amount',         'AMOUNT'),
    ('invoice_value',         'AMOUNT'),
    ('insured_amount',        'AMOUNT'),
    ('presentation_period',   'INTEGER'),
    ('currency',              'CURRENCY_CODE')
) AS v(k, t) WHERE helix_gov.dict_field.key = v.k;

UPDATE helix_gov.dict_field SET value_type = 'STRING' WHERE value_type IS NULL;

-- --- The three terms the summary needs and the dictionary never had ---------
--
-- lc_case carries a denormalised copy of the credit's headline terms so the cases list is
-- one query. Three of them — the credit's own reference, its issue date and its tolerance —
-- were read by a hardcoded list in Java and had no dictionary field, so no rule could cite
-- them and no author could change how they are read. Data, inserted rather than seeded,
-- because the seeder only runs on an empty catalogue.
--
-- Both statements are guarded, because a fresh database has no catalogue for them to patch —
-- the seed file carries these three fields, and the binding names a document type that does
-- not exist yet. Unguarded, the second one fails the migration on the FK and the service
-- never starts; guarded away, the seeder arrives and supplies all of it.

INSERT INTO helix_gov.dict_field (key, name, description, kind, value_type, seeded)
SELECT * FROM (VALUES
    ('credit_reference', 'Credit reference',
     'The credit''s own number, as the issuing bank assigned it.', 'LC_FIELD', 'STRING', TRUE),
    ('issue_date', 'Issue date',
     'The date the credit was issued.', 'LC_FIELD', 'DATE', TRUE),
    ('tolerance_percent', 'Tolerance',
     'The percentage the drawing may exceed the credit amount by.', 'LC_FIELD', 'INTEGER', TRUE)
) AS v
 WHERE EXISTS (SELECT 1 FROM helix_gov.dict_field)
ON CONFLICT (key) DO NOTHING;

INSERT INTO helix_gov.field_binding (field_key, doc_code, note, ordinal)
SELECT * FROM (VALUES
    ('credit_reference',  'LC', 'Tag 20 — the sender''s reference for this credit.', 1),
    ('issue_date',        'LC', 'Tag 31C, YYMMDD.', 2),
    ('tolerance_percent', 'LC', 'Tag 39A — the plus percentage. 0 when the tag is absent.', 3)
) AS v
 WHERE EXISTS (SELECT 1 FROM helix_gov.doc_type WHERE code = 'LC')
ON CONFLICT (field_key, doc_code) DO NOTHING;
