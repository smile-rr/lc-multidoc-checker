-- Vision-extractor result cache.
-- Hit when same (pdf bytes, prompt, model, base_url, render params, request shape) repeats.
-- Per-slot row; consensus is recomputed at read time from current slot config.

CREATE TABLE IF NOT EXISTS lc_v2.vision_extract_cache (
  cache_key         TEXT PRIMARY KEY,
  pdf_sha256        TEXT NOT NULL,
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

ALTER TABLE lc_v2.vision_extract_cache
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_vec_pdf_model
  ON lc_v2.vision_extract_cache (pdf_sha256, model);

CREATE INDEX IF NOT EXISTS ix_vec_expires_at
  ON lc_v2.vision_extract_cache (expires_at) WHERE expires_at IS NOT NULL;
