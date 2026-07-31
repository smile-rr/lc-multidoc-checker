-- Layout-preserving markdown dump of a presented document (VLM), kept as a
-- fallback when structured field extraction is thin or wrong. Separate from
-- lc_fact: facts are dictionary-keyed; this is the full page reading.

ALTER TABLE helix_check.lc_document
    ADD COLUMN IF NOT EXISTS layout_md TEXT;
