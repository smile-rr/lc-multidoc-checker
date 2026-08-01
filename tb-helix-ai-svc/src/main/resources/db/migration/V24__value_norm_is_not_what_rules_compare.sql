-- ----------------------------------------------------------------------------
-- Correcting a comment that was not true.
--
-- V2 introduced `lc_fact.value_norm` saying: "Normalised for comparison: ISO dates,
-- plain decimals, trimmed case. Rules compare this; humans read `value`." None of that
-- sentence describes what happens.
--
--   · What is written is `strip().toUpperCase()` — not an ISO date, not a decimal.
--   · The rule engine is handed `value`, never `value_norm`. It parses per operator,
--     and it has to: SWIFT writes sixty thousand as `USD60000,00`, so a comma with two
--     digits after it is a decimal point and a comma anywhere else is a thousands
--     separator. Getting that backwards multiplies a credit by a hundred and every
--     comparison against it still looks like it worked. No single normalisation can be
--     right for both a date and an amount, which is why the operator does it.
--
-- The column stays: it is an upper-cased copy, it is cheap, and something may yet want a
-- case-folded value that is not a comparison. What goes is the claim, because a comment
-- asserting that rules read a column they do not read is worse than no comment — the next
-- person changes the normalisation to fix a comparison and nothing moves.
--
-- The migration file cannot be edited (Flyway checksums it), so the correction goes where
-- anyone looking at the column will actually see it.
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN helix_check.lc_fact.value_norm IS
    'An upper-cased, trimmed copy of value. NOT what rules compare — RuleEvaluator is '
    'given `value` and parses it per operator, because reading "USD60000,00" as an amount '
    'and "2026-07-30" as a date are different jobs and no one normalisation does both.';

COMMENT ON COLUMN helix_check.lc_fact.value IS
    'What the document says, as it says it. This is what the rule engine compares and what '
    'an officer reads.';

COMMENT ON COLUMN helix_check.lc_finding.comparison IS
    'The settled rows of an exact check, as ComparisonView: every operand with what was '
    'read on it, the operator, and the row outcome. This is the working an officer is shown '
    'and the evidence a refusal is defended on.';
