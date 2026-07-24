-- Vision-extractor result cache.
-- Identity: pdf_sha256 + page_numbers + prompt + model + base_url + render params + request_shape_v.
-- filename / page_numbers are stored for human SQL inspection (filename is not in cache_key).

CREATE TABLE IF NOT EXISTS lc_v3.vision_extract_cache (
  cache_key         TEXT PRIMARY KEY,
  pdf_sha256        TEXT NOT NULL,
  filename          TEXT,
  page_numbers      TEXT,
  prompt_sha256     TEXT NOT NULL,
  model             TEXT NOT NULL,
  base_url          TEXT NOT NULL,
  render_dpi        INT  NOT NULL,
  max_pages         INT  NOT NULL,
  max_long_edge     INT,
  request_shape_v   INT  NOT NULL,
  raw_response      JSONB NOT NULL,
  parsed_envelope   JSONB NOT NULL,
  off_schema_raw    JSONB,
  prompt_tokens     INT,
  completion_tokens INT,
  total_tokens      INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  hit_count         INT NOT NULL DEFAULT 0,
  last_hit_at       TIMESTAMPTZ
);

ALTER TABLE lc_v3.vision_extract_cache
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE lc_v3.vision_extract_cache
  ADD COLUMN IF NOT EXISTS filename TEXT;

ALTER TABLE lc_v3.vision_extract_cache
  ADD COLUMN IF NOT EXISTS page_numbers TEXT;

CREATE INDEX IF NOT EXISTS ix_vec_pdf_model
  ON lc_v3.vision_extract_cache (pdf_sha256, model);

CREATE INDEX IF NOT EXISTS ix_vec_pdf_pages
  ON lc_v3.vision_extract_cache (pdf_sha256, page_numbers);

CREATE INDEX IF NOT EXISTS ix_vec_expires_at
  ON lc_v3.vision_extract_cache (expires_at) WHERE expires_at IS NOT NULL;
