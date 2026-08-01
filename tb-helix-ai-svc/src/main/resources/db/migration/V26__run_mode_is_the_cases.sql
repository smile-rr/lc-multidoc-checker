-- ----------------------------------------------------------------------------
-- How this case is being worked, remembered.
--
-- Auto vs Step lived in one browser tab's reducer, initialised to 'auto' on every
-- mount. So an officer who put a case into Step, then reloaded, switched tab, came
-- back tomorrow, or handed it to a colleague, found it in Auto again — and Auto's
-- whole behaviour is to keep going without asking. The one mode you would choose
-- BECAUSE you want to be asked was the one that did not survive being looked away
-- from.
--
-- It belongs on the case rather than in local storage because it is a fact about how
-- this examination is being conducted, not a preference of whoever has it open. Two
-- officers on one case are working it the same way, or one of them is surprised.
--
-- 'auto' for everything already here: that is what they have been running as, and a
-- migration is not the place to change how a case behaves.
-- ----------------------------------------------------------------------------
ALTER TABLE helix_check.lc_case
    ADD COLUMN IF NOT EXISTS run_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE helix_check.lc_case DROP CONSTRAINT IF EXISTS lc_case_run_mode_ck;
ALTER TABLE helix_check.lc_case ADD CONSTRAINT lc_case_run_mode_ck
    CHECK (run_mode IN ('auto', 'step'));

COMMENT ON COLUMN helix_check.lc_case.run_mode IS
    'Who presses next: auto runs stage to stage unasked, step waits for the officer. A '
    'property of the case, not of the browser that opened it.';
