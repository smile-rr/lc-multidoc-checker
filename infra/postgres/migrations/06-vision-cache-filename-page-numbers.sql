-- Human-readable columns on vision_extract_cache (ops / SQL inspection).
-- Cache key still uses pdf_sha256 + page_numbers string + prompt + model + render params.

ALTER TABLE lc_v3.vision_extract_cache
  ADD COLUMN IF NOT EXISTS filename TEXT;

ALTER TABLE lc_v3.vision_extract_cache
  ADD COLUMN IF NOT EXISTS page_numbers TEXT;

-- Backfill from legacy column name if present from an earlier deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lc_v3' AND table_name = 'vision_extract_cache'
      AND column_name = 'page_fingerprint'
  ) THEN
    UPDATE lc_v3.vision_extract_cache
    SET page_numbers = page_fingerprint
    WHERE page_numbers IS NULL AND page_fingerprint IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN lc_v3.vision_extract_cache.filename IS
  'Officer-facing source label (e.g. invoice.pdf); not part of cache_key.';

COMMENT ON COLUMN lc_v3.vision_extract_cache.page_numbers IS
  '1-based bundle page fingerprint (e.g. 1, 2-3, 2,4,6); part of cache identity with pdf_sha256.';

CREATE INDEX IF NOT EXISTS ix_vec_pdf_pages
  ON lc_v3.vision_extract_cache (pdf_sha256, page_numbers);
