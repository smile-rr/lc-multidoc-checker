-- ----------------------------------------------------------------------------
-- Two kinds of "we could not check that", told apart.
--
-- `UNANSWERABLE` covered both of these, and they are different people's problems:
--
--   NOT_PRESENTED   the document is not in the bundle. Nothing was read because there
--                   was nothing to read. That is a fact about the PRESENTATION — the
--                   beneficiary did not lodge it — and it usually points at a
--                   missing-document discrepancy that another check raises properly.
--
--   NOT_EXTRACTED   the document IS there and we did not read the field off it. That
--                   is a fact about US. It is fixable, and reporting it as though the
--                   documents were at fault hides the one signal that would get it
--                   fixed — over a hundred cases, "our reading is weak on this field"
--                   is invisible if it arrives wearing the same word as a missing
--                   bill of lading.
--
-- `UNANSWERABLE` survives for the third case: something WAS read and cannot be used —
-- a date that will not parse, an amount that is not a number. Both parties can see the
-- value; nobody can compare it.
--
-- All three still produce DOUBT. A check that could not run has not passed, and none of
-- this changes that. What changes is what the officer is told to do about it.
-- ----------------------------------------------------------------------------
ALTER TABLE helix_check.lc_finding DROP CONSTRAINT IF EXISTS lc_finding_outcome_reason_ck;

ALTER TABLE helix_check.lc_finding ADD CONSTRAINT lc_finding_outcome_reason_ck
    CHECK (outcome_reason IS NULL OR outcome_reason IN (
        'LOW_CONFIDENCE',
        'UNANSWERABLE',
        'NOT_PRESENTED',
        'NOT_EXTRACTED',
        'NO_RULE',
        'HUMAN_ONLY',
        'NOT_REACHED',
        'TRIGGER_NOT_MET',
        'SET_ASIDE'));

COMMENT ON COLUMN helix_check.lc_finding.outcome_reason IS
    'Why an absence is an absence. Set only where the outcome is DOUBT or NOT_RUN — a '
    'DISCREPANT or CLEAN finding is a conclusion and explains itself. NOT_PRESENTED is the '
    'presentation''s gap; NOT_EXTRACTED is ours.';
