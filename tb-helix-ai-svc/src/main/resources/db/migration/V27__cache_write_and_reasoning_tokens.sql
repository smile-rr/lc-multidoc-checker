-- Input splits three ways, output splits two, and the ledger only had one of each.
--
-- Until now a call reported prompt_tokens (with cached_prompt_tokens broken out of it) and
-- completion_tokens. That is the whole story on an OpenAI-shaped provider and only half of
-- it elsewhere:
--
--   * A provider with an explicit prompt cache bills the call that *writes* the prefix at a
--     premium — Anthropic at roughly 1.25x input — and the calls that *read* it at about a
--     tenth. Folding the write into ordinary input under-reports the first call of every
--     prefix, which is precisely the call that pays for all the later ones. It also makes
--     the images-first ordering look free to establish, which it is not.
--   * A model with reasoning turned on bills the thinking at the output rate. The money is
--     the same either way, so this changes no total — what it changes is that "why did the
--     plan cost four times the extraction" becomes an answerable question instead of a
--     shrug. plan.govern runs with helix.check.plan.thinking on, so this is being paid for
--     today and reported as ordinary output.
--
-- Both default to zero, which is the honest reading for every provider currently configured:
-- the OpenAI-shaped ones do not separate a cache write, and report no reasoning count when
-- enable_thinking is false. Zero here means "nothing was billed this way", not "unknown".

ALTER TABLE helix_infra.model_call
    ADD COLUMN IF NOT EXISTS cache_write_tokens INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reasoning_tokens   INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN helix_infra.model_call.cache_write_tokens IS
    'Part of prompt_tokens written into the provider prompt cache and billed at its write '
    'rate. A breakdown of prompt_tokens, never an addition to it — summing them bills the '
    'same input twice. Zero where the provider does not separate a cache write.';

COMMENT ON COLUMN helix_infra.model_call.reasoning_tokens IS
    'Part of completion_tokens spent thinking rather than answering. A breakdown of '
    'completion_tokens, never an addition to it. Zero where reasoning was off or unreported.';

-- --- The rate that goes with the new column ---------------------------------
--
-- Nullable, and null means something specific: this family has no separate cache-write rate,
-- so a write is billed as ordinary input. That is the correct reading for every family in
-- the book today. A zero would be a rate — and $0.00/M reads as free, which is the one
-- answer certain to be wrong.
--
-- No reasoning rate column. Every vendor whose table has been checked bills reasoning at the
-- ordinary output rate, and a column that always equals another column is a second place for
-- the same fact to go stale. If one ever prices it apart, that is when it earns a column.

ALTER TABLE helix_infra.model_price
    ADD COLUMN IF NOT EXISTS cache_write_per_million NUMERIC(12,6);

ALTER TABLE helix_infra.model_price_band
    ADD COLUMN IF NOT EXISTS cache_write_per_million NUMERIC(12,6);

COMMENT ON COLUMN helix_infra.model_price.cache_write_per_million IS
    'What this family charges to write a prompt prefix into its cache. NULL means it does '
    'not price writes apart, so a write costs the ordinary input rate.';
