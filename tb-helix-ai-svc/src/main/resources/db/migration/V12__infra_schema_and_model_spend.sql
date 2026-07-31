-- Infrastructure gets its own schema, and model spend gets recorded.
--
-- Two things, in one migration because the second is the reason for the first.
--
-- ## helix_core becomes helix_infra
--
-- The schema was named after a `core` package that no longer exists — the layers
-- are infra → harness → governance/lccheck → app, and everything in here (blobs,
-- the derivation cache, the price book) is infra. A schema named after a deleted
-- package is a map of a building that was rebuilt.
--
-- The tables move; `flyway_schema_history` does not. Flyway resolves its own
-- table from configuration at connection time, so a migration that moved it out
-- from under the migration currently running would fail on its own success
-- record. helix_core stays behind holding the history table and nothing else.
--
-- ## What a run cost
--
-- Interpret makes a vision call per document, intake reads the credit, plan and
-- execute ask a text model — and the spend panel showed nothing at all, because
-- nothing was written down per call. Token counts reached `derivation`, but only
-- for calls that missed the cache, and a cache row is keyed by content rather
-- than by case: it can say what an answer cost to produce once, never what this
-- examination spent.
--
-- So `model_call` — one row per attempt on a provider, with what it cost in
-- tokens and time and whether it was answered without asking. Money is not
-- stored: prices change, and a stored cost is a number that silently stops
-- matching the rate it was computed from. It is a join.

CREATE SCHEMA IF NOT EXISTS helix_infra;

ALTER TABLE helix_core.blob         SET SCHEMA helix_infra;
ALTER TABLE helix_core.blob_content SET SCHEMA helix_infra;
ALTER TABLE helix_core.blob_ref     SET SCHEMA helix_infra;
ALTER TABLE helix_core.derivation   SET SCHEMA helix_infra;

-- The old price book was keyed by exact model id and held one row: 'engine'.
-- Keying by version was the mistake — `qwen3.7-flash` becomes `qwen3.8-flash`
-- and the rate silently stops resolving. lc_run_step referenced it; the column
-- stays, the constraint goes, because a run step naming a model nobody has
-- priced is a fact about the price book, not an invalid run.
ALTER TABLE helix_check.lc_run_step DROP CONSTRAINT IF EXISTS lc_run_step_model_id_fkey;
DROP TABLE IF EXISTS helix_core.model_price;

-- ---------------------------------------------------------------------------
-- The price book, by family.
--
-- Families, not versions. Vendors ship a new number every few months and the
-- tiers stay put — an economy model, a balanced one, a frontier one — so the
-- rate that matters is the tier's. `match_patterns` maps a configured model id
-- onto its family, longest pattern first, which makes adding next quarter's
-- model a row rather than a release.
--
-- Rates are list price in USD per million tokens, quoted July 2026. They are an
-- estimate for a model of that class and are meant to be edited.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_infra.model_price (
    family                TEXT PRIMARY KEY,
    label                 TEXT NOT NULL,
    vendor                TEXT NOT NULL,
    tier                  TEXT NOT NULL CHECK (tier IN ('none', 'economy', 'balanced', 'frontier')),
    in_per_million        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    out_per_million       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    -- What a prompt cached on the provider's side costs instead of the full input
    -- rate. NULL where the vendor does not price it separately.
    cached_in_per_million NUMERIC(12, 6),
    match_patterns        TEXT[] NOT NULL DEFAULT '{}',
    note                  TEXT,
    quoted_on             DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO helix_infra.model_price
    (family, label, vendor, tier, in_per_million, out_per_million, cached_in_per_million, match_patterns, note)
VALUES
    ('engine', 'No model', 'helix', 'none', 0, 0, 0, ARRAY['engine'],
     'An exact rule is settled by comparing what was read. Priced so that free work is visibly free rather than missing.'),

    ('qwen-flash', 'Qwen Flash', 'alibaba', 'economy', 0.05, 0.40, NULL,
     ARRAY['qwen3.7-flash', 'qwen3.6-flash', 'qwen-flash', 'flash'],
     'Singapore endpoint list price. The mainland endpoint is materially cheaper.'),
    ('qwen-plus', 'Qwen Plus', 'alibaba', 'balanced', 0.40, 1.20, NULL,
     ARRAY['qwen3.7-plus', 'qwen3.6-plus', 'qwen3.6-vl-plus', 'qwen-vl-plus', 'qwen-plus'], NULL),
    ('qwen-max', 'Qwen Max', 'alibaba', 'frontier', 2.50, 7.50, NULL,
     ARRAY['qwen3.7-max', 'qwen-max'],
     'List price. Often runs at half this on promotion.'),

    ('deepseek-flash', 'DeepSeek Flash', 'deepseek', 'economy', 0.14, 0.28, 0.0028,
     ARRAY['deepseek-v4-flash', 'deepseek-chat', 'deepseek-flash', 'deepseek'],
     'Prompt-cache hits are priced fifty times lower than a miss, which is why cached input is tracked separately.'),
    ('deepseek-pro', 'DeepSeek Pro', 'deepseek', 'balanced', 0.435, 0.87, 0.003625,
     ARRAY['deepseek-v4-pro', 'deepseek-reasoner', 'deepseek-pro'], NULL),

    ('claude-haiku', 'Claude Haiku', 'anthropic', 'economy', 1.00, 5.00, 0.10,
     ARRAY['claude-haiku', 'haiku'], 'Cache hits bill at a tenth of the input rate.'),
    ('claude-sonnet', 'Claude Sonnet', 'anthropic', 'balanced', 3.00, 15.00, 0.30,
     ARRAY['claude-sonnet', 'sonnet'], 'Standard rate; an introductory 2/10 has been running through August 2026.'),
    ('claude-opus', 'Claude Opus', 'anthropic', 'frontier', 5.00, 25.00, 0.50,
     ARRAY['claude-opus', 'opus'], NULL),

    ('gpt-mini', 'GPT mini', 'openai', 'economy', 0.20, 1.20, NULL,
     ARRAY['gpt-5-nano', 'gpt-nano', 'nano', 'gpt-mini', 'mini'], NULL),
    ('gpt-mid', 'GPT mid', 'openai', 'balanced', 2.00, 12.00, NULL,
     ARRAY['gpt-mid'], NULL),
    ('gpt', 'GPT flagship', 'openai', 'frontier', 5.00, 30.00, NULL,
     ARRAY['gpt-5', 'gpt-4', 'gpt'], 'Long-context requests are metered higher; this is the standard tier.');

-- ---------------------------------------------------------------------------
-- One row per attempt on a model.
--
-- No foreign key to lc_case. This schema is infrastructure and must not know
-- what an examination is — and a call whose case was deleted is still a call
-- that was paid for.
-- ---------------------------------------------------------------------------
CREATE TABLE helix_infra.model_call (
    id                   BIGSERIAL   PRIMARY KEY,
    at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Where it came from, when the caller could say. Loose strings on purpose.
    case_id              UUID,
    stage                TEXT,
    step                 TEXT,

    role                 TEXT        NOT NULL,   -- extract | plan | judge | read-text | narrate
    slot                 TEXT,                   -- vlm-1, llm-2 — which configured slot answered
    model_id             TEXT        NOT NULL,   -- as configured, with its version
    family               TEXT        REFERENCES helix_infra.model_price(family),
    provider             TEXT,                   -- host of the base url
    kind                 TEXT        NOT NULL CHECK (kind IN ('TEXT', 'VISION', 'TOOL')),

    -- OK is a provider that answered. CACHED never reached one. FAILED and
    -- TIMEOUT cost latency and no tokens, and are the rows a slow-run
    -- investigation actually wants.
    status               TEXT        NOT NULL CHECK (status IN ('OK', 'CACHED', 'FAILED', 'TIMEOUT')),
    attempt              SMALLINT    NOT NULL DEFAULT 1,

    prompt_tokens        INT         NOT NULL DEFAULT 0,
    completion_tokens    INT         NOT NULL DEFAULT 0,
    cached_prompt_tokens INT         NOT NULL DEFAULT 0,
    latency_ms           INT,

    derivation_key       CHAR(64),
    error                TEXT
);

CREATE INDEX ix_model_call_case ON helix_infra.model_call (case_id, at);
CREATE INDEX ix_model_call_when ON helix_infra.model_call (at DESC);
CREATE INDEX ix_model_call_slow ON helix_infra.model_call (latency_ms DESC) WHERE status <> 'CACHED';
CREATE INDEX ix_model_call_bad  ON helix_infra.model_call (status, at DESC) WHERE status IN ('FAILED', 'TIMEOUT');

-- ---------------------------------------------------------------------------
-- The event tape, made queryable.
--
-- Every event was already persisted, as one jsonb blob per row, which is the
-- right way to store something whose payload differs per type. It is the wrong
-- way to ask "which step failed most often last week" or "where did the ninety
-- seconds go" — questions worth asking of a tape nobody is watching live.
--
-- Generated columns rather than a second write path, so there is still one
-- writer and nothing to keep in step. V10 removed generated columns from the
-- governance documents for the opposite reason and both are right: there the
-- keys were attributes an author could rename, here they are four constants on
-- HelixEvent that the whole pipeline is written against.
-- ---------------------------------------------------------------------------
ALTER TABLE helix_check.lc_event
    ADD COLUMN type   TEXT GENERATED ALWAYS AS (event ->> 'type') STORED,
    ADD COLUMN stage  TEXT GENERATED ALWAYS AS (event -> 'payload' ->> 'stage') STORED,
    ADD COLUMN step   TEXT GENERATED ALWAYS AS (event -> 'payload' ->> 'step') STORED,
    ADD COLUMN status TEXT GENERATED ALWAYS AS (event -> 'payload' ->> 'status') STORED;

CREATE INDEX ix_event_type  ON helix_check.lc_event (type, created_at DESC);
CREATE INDEX ix_event_stage ON helix_check.lc_event (case_id, stage, created_at);
-- The rows an investigation starts from: something that did not simply work.
CREATE INDEX ix_event_bad   ON helix_check.lc_event (status, created_at DESC)
    WHERE status IN ('FAILED', 'SKIPPED', 'HALTED');
