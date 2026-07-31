-- The price book, checked against the vendors' own published tables (2026-07-31).
--
-- Two corrections, one of them expensive.
--
-- **1. The flash rate was five times under.** The book charged $0.05/$0.40 per million,
-- which is the price of the generation-less `qwen-flash` alias. What this deployment calls
-- is `qwen3.7-flash`, and on the international endpoint that is $0.25/$1.50. Every cost this
-- system has reported was four to five times under, in the direction nobody checks — a
-- figure that looks small gets believed.
--
-- One family per *level*, priced at the current generation's rate. There is deliberately no
-- separate `qwen-flash` and `qwen3-flash` row: we run the latest model, two rows would be
-- two things to keep straight for a distinction we never exercise, and where the generations
-- differ the newer and dearer one is the safe number to hold — under-reporting spend is the
-- failure that goes unnoticed. The bare `flash` catch-all pattern is gone: a catch-all in a
-- price book does not fail, it quietly charges the wrong rate for anything new.
--
-- **2. Length bands are real and steep.** Alibaba prices by input length and the step at
-- 256K is four to five times. A single flat rate under-reports every long call. Bands are
-- optional per family — a vendor that charges one rate however long the prompt has none,
-- which is Anthropic, OpenAI and DeepSeek.
--
-- All rates below are **USD per million tokens, international (Singapore) endpoint** — the
-- one this deployment calls. The China-region tables are a different product at different
-- prices and are deliberately not here; mixing the two is what makes a book untrustworthy.
--
-- Sources, all first-party:
--   Alibaba  https://www.alibabacloud.com/help/en/model-studio/model-pricing
--   DeepSeek https://api-docs.deepseek.com/quick_start/pricing
--   OpenAI   https://developers.openai.com/api/docs/pricing
--   Claude   https://platform.claude.com/docs/en/about-claude/pricing

CREATE TABLE IF NOT EXISTS helix_infra.model_price_band (
    family                TEXT          NOT NULL
                          REFERENCES helix_infra.model_price(family) ON DELETE CASCADE,
    -- Inclusive upper bound on the *input* length that selects this band. The vendor's
    -- tables read "0 < Token <= 256K", so the bound is the number in that phrase.
    up_to_prompt_tokens   INT           NOT NULL,
    in_per_million        NUMERIC(12,6) NOT NULL,
    out_per_million       NUMERIC(12,6) NOT NULL,
    cached_in_per_million NUMERIC(12,6),
    PRIMARY KEY (family, up_to_prompt_tokens)
);

-- Rewritten wholesale rather than patched. A price book half-corrected is worse than one
-- uniformly wrong, because nobody can tell which half they are reading.
DELETE FROM helix_infra.model_price_band;

INSERT INTO helix_infra.model_price
    (family, label, vendor, tier, in_per_million, out_per_million, cached_in_per_million,
     match_patterns, note, quoted_on)
VALUES
    -- --- Alibaba, international endpoint ------------------------------------
    ('engine', 'No model', 'none', 'none', 0, 0, NULL,
     ARRAY['engine'], 'Work settled without asking a model. Priced so a free step reads as free rather than as unpriced.', DATE '2026-07-31'),

    ('qwen-flash', 'Qwen Flash', 'alibaba', 'economy', 0.25, 1.50, NULL,
     ARRAY['qwen3.7-flash', 'qwen3.6-flash', 'qwen3.5-flash', 'qwen-flash'],
     'The text model this deployment calls. Current-generation rate; the older generation-less alias was a fifth of this and is not tracked separately.', DATE '2026-07-31'),

    ('qwen-vl-flash', 'Qwen VL Flash', 'alibaba', 'economy', 0.05, 0.40, NULL,
     ARRAY['qwen3.7-vl-flash', 'qwen3.6-vl-flash', 'qwen-vl-flash', 'vl-flash'],
     'The vision model this deployment calls. Banded at 32K and 128K — page images reach these quickly.', DATE '2026-07-31'),

    ('qwen-plus', 'Qwen Plus', 'alibaba', 'balanced', 0.40, 1.60, NULL,
     ARRAY['qwen3.7-plus', 'qwen3.6-plus', 'qwen3.5-plus', 'qwen-plus'],
     'Current-generation rate. The generation-less alias outputs at 1.20; the dearer figure is the safe one to hold.', DATE '2026-07-31'),

    ('qwen-vl-plus', 'Qwen VL Plus', 'alibaba', 'balanced', 0.21, 0.63, NULL,
     ARRAY['qwen-vl-plus'], NULL, DATE '2026-07-31'),

    ('qwen-max', 'Qwen Max', 'alibaba', 'frontier', 2.50, 7.50, NULL,
     ARRAY['qwen3.7-max', 'qwen3.6-max', 'qwen-max'],
     'Current-generation rate. The generation-less alias is 1.60/6.40.', DATE '2026-07-31'),

    -- --- DeepSeek ------------------------------------------------------------
    -- Verified unchanged. The cache rate is the vendor's own cache-hit input price.
    ('deepseek-flash', 'DeepSeek Flash', 'deepseek', 'economy', 0.14, 0.28, 0.0028,
     ARRAY['deepseek-v4-flash', 'deepseek-chat', 'deepseek-flash'], NULL, DATE '2026-07-31'),

    ('deepseek-pro', 'DeepSeek Pro', 'deepseek', 'balanced', 0.435, 0.87, 0.003625,
     ARRAY['deepseek-v4-pro', 'deepseek-reasoner', 'deepseek-pro', 'deepseek'], NULL, DATE '2026-07-31'),

    -- --- Anthropic -----------------------------------------------------------
    -- By tier, not by version, as agreed: a vendor ships a new number every few months and a
    -- book keyed to versions answers "unknown model" the morning after an upgrade.
    ('claude-haiku', 'Claude Haiku', 'anthropic', 'economy', 1.00, 5.00, 0.10,
     ARRAY['claude-haiku', 'haiku'], NULL, DATE '2026-07-31'),

    ('claude-sonnet', 'Claude Sonnet', 'anthropic', 'balanced', 2.00, 10.00, 0.20,
     ARRAY['claude-sonnet', 'sonnet'],
     'Introductory rate for Sonnet 5, in effect to 2026-08-31. Reverts to 3.00/15.00 with a 0.30 cache read on 2026-09-01 — change it then, or this book will under-report.', DATE '2026-07-31'),

    ('claude-opus', 'Claude Opus', 'anthropic', 'frontier', 5.00, 25.00, 0.50,
     ARRAY['claude-opus', 'opus'], NULL, DATE '2026-07-31'),

    ('claude-fable', 'Claude Fable', 'anthropic', 'frontier', 10.00, 50.00, 1.00,
     ARRAY['claude-fable', 'fable', 'mythos'], NULL, DATE '2026-07-31'),

    -- --- OpenAI --------------------------------------------------------------
    ('gpt-mini', 'GPT mini', 'openai', 'economy', 0.20, 1.20, 0.02,
     ARRAY['gpt-5-nano', 'gpt-nano', 'gpt-mini', '-luna'], NULL, DATE '2026-07-31'),

    ('gpt-mid', 'GPT mid', 'openai', 'balanced', 2.00, 12.00, 0.20,
     ARRAY['gpt-mid', '-terra'], NULL, DATE '2026-07-31'),

    ('gpt', 'GPT flagship', 'openai', 'frontier', 5.00, 30.00, 0.50,
     ARRAY['gpt-5', 'gpt-4', 'gpt', '-sol'], NULL, DATE '2026-07-31')

ON CONFLICT (family) DO UPDATE SET
    label = EXCLUDED.label, vendor = EXCLUDED.vendor, tier = EXCLUDED.tier,
    in_per_million = EXCLUDED.in_per_million,
    out_per_million = EXCLUDED.out_per_million,
    cached_in_per_million = EXCLUDED.cached_in_per_million,
    match_patterns = EXCLUDED.match_patterns,
    note = EXCLUDED.note,
    quoted_on = EXCLUDED.quoted_on;

-- Length bands. Only the vendors that price this way have any.
INSERT INTO helix_infra.model_price_band
    (family, up_to_prompt_tokens, in_per_million, out_per_million)
VALUES
    ('qwen-flash',     262144, 0.25, 1.50),
    ('qwen-flash',    1048576, 1.00, 4.00),

    -- Vision bands are much tighter, and page images cross them: six pages of a scanned
    -- presentation is comfortably past 32K, so a flat rate here would be wrong on almost
    -- every call this system makes.
    ('qwen-vl-flash',   32768, 0.05,  0.40),
    ('qwen-vl-flash',  131072, 0.075, 0.60),
    ('qwen-vl-flash',  262144, 0.12,  0.96),

    ('qwen-plus',      262144, 0.40, 1.60),
    ('qwen-plus',     1048576, 1.20, 4.80);

-- Per-generation rows this migration briefly created, before the book settled on one family
-- per level. Removed rather than left: two rows for one model is the thing that makes a
-- price book untrustworthy, and their bands go with them by cascade.
DELETE FROM helix_infra.model_price WHERE family IN ('qwen3-flash', 'qwen3-plus', 'qwen3-max');
