-- ============================================================================
-- helix_core — the platform both business modules stand on.
--
-- Two things live here, and the difference between them is the most important
-- distinction in the storage design:
--
--   CASE STATE           "what happened in this examination"
--                        per-case, permanent, the audit record.
--                        Lives in helix_check / helix_gov. Never evicted.
--
--   DERIVATION CACHE     "for this exact input + prompt + model, what was the
--                        answer" — cross-case, content-addressed, evictable.
--                        Losing it costs money and latency, never correctness.
--
-- Conflating them is why a session-scoped design cannot answer "have we seen
-- this document before" without a session. Here they are separate tables with
-- separate lifetimes.
--
-- The other rule: bytes on disk, JSON in Postgres. A 6 MB scanned PDF has no
-- business in a row; a structured extraction result has no business in a
-- filesystem, where TTL, hit counts and indexed lookup all have to be
-- hand-built.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS helix_core;


-- ----------------------------------------------------------------------------
-- Blob catalogue.
--
-- The bytes live on disk under cas/<aa>/<bb>/<sha256>. This table is the index,
-- and it is the reason the disk layout needs no case folders or doc-type
-- folders: "which blobs belong to case X" is a query, not a directory walk.
-- Present the same deal bundle twice and it is one file.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_core.blob (
    sha256            CHAR(64)    PRIMARY KEY,
    byte_size         BIGINT      NOT NULL,
    media_type        TEXT        NOT NULL,
    storage_tier      TEXT        NOT NULL DEFAULT 'DISK'
                      CHECK (storage_tier IN ('DISK', 'S3')),
    storage_key       TEXT        NOT NULL,
    original_filename TEXT,
    -- Cached here so nothing re-opens a PDF just to count its pages.
    page_count        INT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN helix_core.blob.storage_key IS
    'Path within the store, e.g. cas/ab/cd/abcd… — becomes the object key unchanged under S3.';


-- Who points at a blob. Garbage collection is "blobs with no ref, older than
-- helix.blob.orphan-grace".
--
-- No ref_count column on blob: a counter drifts the first time a delete path is
-- missed, and a wrong counter deletes evidence. A join cannot drift.
CREATE TABLE helix_core.blob_ref (
    blob_sha   CHAR(64)    NOT NULL REFERENCES helix_core.blob(sha256) ON DELETE CASCADE,
    owner_kind TEXT        NOT NULL CHECK (owner_kind IN ('CASE', 'DERIVATION', 'GOV_IMPORT')),
    owner_id   TEXT        NOT NULL,
    role       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_kind, owner_id, role, blob_sha)
);

COMMENT ON COLUMN helix_core.blob_ref.role IS
    'source | converted_pdf | doc_pdf | page_png — what this blob is TO its owner.';

CREATE INDEX ix_blob_ref_blob ON helix_core.blob_ref (blob_sha);


-- ----------------------------------------------------------------------------
-- Derivation cache — "op(version, inputs, model, params) = result".
--
-- Every expensive call declares a key and is looked up BEFORE any work happens:
-- before the PDF is rendered, before the HTTP request is built. That ordering is
-- the whole point — a cache consulted after rendering saves the model call but
-- still pays for the render.
--
--   op                  input_sha            input_scope      model?
--   ------------------  -------------------  ---------------  ------
--   convert.tiff_pdf    source TIFF          —                no
--   render.pages        pdf                  '2-3'            no
--   parse.mt700         lc.txt               —                no
--   segment.bundle      pdf                  —                yes
--   extract.doc         pdf                  'INV|2-3'        yes
--   plan.requirements   credit text          '47A'            yes
--   judge.rule          facts digest         check id         yes
--
-- op_version is the invalidation lever: bump it for one op and only that op
-- recomputes, rather than a single global shape version that invalidates
-- everything at once.
--
-- Soundness depends on determinism, so every cacheable model call is issued at
-- temperature 0. A cached answer from a sampling call is a lie about repeatability.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_core.derivation (
    cache_key         CHAR(64)    PRIMARY KEY,
    op                TEXT        NOT NULL,
    op_version        INT         NOT NULL,
    input_sha         CHAR(64)    NOT NULL,
    input_scope       TEXT,
    prompt_sha        CHAR(64),
    model_id          TEXT,
    provider_url      TEXT,
    params            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- The answer, in whichever form it takes. A structured extraction lands in
    -- `result`; a converted PDF lands in the blob store and `result_blob_sha`
    -- points at it. Both may be set (a render records its page list AND its bytes).
    result            JSONB,
    result_blob_sha   CHAR(64)    REFERENCES helix_core.blob(sha256),
    -- Verbatim provider payload. Kept because when an extraction is wrong, the
    -- question is always "what did the model actually say", and a parsed envelope
    -- cannot answer it.
    raw_response      JSONB,
    prompt_tokens     INT,
    completion_tokens INT,
    total_tokens      INT,
    latency_ms        INT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ,
    hit_count         INT         NOT NULL DEFAULT 0,
    last_hit_at       TIMESTAMPTZ
);

COMMENT ON COLUMN helix_core.derivation.cache_key IS
    'sha256 of the canonical (op, op_version, input_sha, input_scope, prompt_sha, model_id, provider_url, params) string.';
COMMENT ON COLUMN helix_core.derivation.expires_at IS
    'NULL means never expire — correct for deterministic ops like convert.tiff_pdf.';

-- Lookup is by primary key. These two serve inspection and the TTL sweep.
CREATE INDEX ix_deriv_op_input ON helix_core.derivation (op, input_sha);
CREATE INDEX ix_deriv_expiry   ON helix_core.derivation (expires_at) WHERE expires_at IS NOT NULL;


-- ----------------------------------------------------------------------------
-- Model price book.
--
-- Lifts per-million rates out of the UI fixture so the cost drawer and the
-- portfolio spend panel read real numbers. Exact rules run on the deterministic
-- engine, which is priced at zero — that is a fact about the tier, and it is
-- what makes the exact/judged split visible in money.
-- ----------------------------------------------------------------------------
CREATE TABLE helix_core.model_price (
    model_id        TEXT          PRIMARY KEY,
    label           TEXT          NOT NULL,
    role            TEXT,
    in_per_million  NUMERIC(10,4) NOT NULL DEFAULT 0,
    out_per_million NUMERIC(10,4) NOT NULL DEFAULT 0,
    host            TEXT,
    effective_from  DATE          NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO helix_core.model_price (model_id, label, role, in_per_million, out_per_million, host)
VALUES ('engine', 'Deterministic engine', 'Rule cards · field against field', 0, 0, 'in-process')
ON CONFLICT (model_id) DO NOTHING;
