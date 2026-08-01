-- ============================================================================
-- One outcome vocabulary, from the plan to the advice.
--
-- Three vocabularies named the same fact three ways and shared no word between
-- them: a finding's `severity` (discrepancy | possible | clean | manual), the
-- officer's `disposition` (agreed | parked | rejected) and the case's `verdict`
-- (refuse | waiver | second). An officer reading a case translated twice to answer
-- one question — what did we find, and does it stand.
--
--   NOT_RUN     no result exists. The default, and never a silent pass.
--   CLEAN       it held.
--   DOUBT       nothing settled it. Waiting on a person; `outcome_reason` says why.
--   DISCREPANT  a ground to refuse on.
--
-- The rule engine already returns PASS / FAIL / INCONCLUSIVE for the same three
-- reasons, and the fourth is the case it cannot express because it never ran.
--
-- **The column was never a severity.** `lc_plan_check.severity` is the real one
-- (CRITICAL | MAJOR | MINOR — how much it matters) and is untouched here. The one
-- on `lc_finding` answered a different question and borrowed the name, which is why
-- two columns called `severity` on two tables in one schema meant two things.
-- ============================================================================

-- ---- Findings --------------------------------------------------------------
ALTER TABLE helix_check.lc_finding ADD COLUMN outcome TEXT;
ALTER TABLE helix_check.lc_finding ADD COLUMN outcome_reason TEXT;

-- `manual` split on where the absence came from, which the old value could not say:
-- a finding with no plan check is a hole in the rulebook (a rule to write), one with
-- a check that ran and could not conclude is a field to fix. Both are DOUBT and the
-- reason keeps them apart — see `state/outcome.js` for the full vocabulary.
UPDATE helix_check.lc_finding SET
    outcome = CASE severity
                  WHEN 'discrepancy' THEN 'DISCREPANT'
                  WHEN 'possible'    THEN 'DOUBT'
                  WHEN 'clean'       THEN 'CLEAN'
                  ELSE 'DOUBT'
              END,
    outcome_reason = CASE
                         WHEN severity = 'possible' THEN 'LOW_CONFIDENCE'
                         WHEN severity = 'manual' AND plan_check_id IS NULL THEN 'NO_RULE'
                         WHEN severity = 'manual' THEN 'UNANSWERABLE'
                         ELSE NULL
                     END;

ALTER TABLE helix_check.lc_finding ALTER COLUMN outcome SET NOT NULL;

-- NOT_RUN is deliberately absent: a finding *is* a result, so its existence is what
-- says the check ran. Absence of a finding is what NOT_RUN means, and it is derived
-- rather than stored — a stored copy is a second source of truth that can disagree
-- with `lc_plan_check.status` about whether anything happened.
ALTER TABLE helix_check.lc_finding
    ADD CONSTRAINT lc_finding_outcome_ck
    CHECK (outcome IN ('DISCREPANT', 'DOUBT', 'CLEAN'));

ALTER TABLE helix_check.lc_finding
    ADD CONSTRAINT lc_finding_outcome_reason_ck
    CHECK (outcome_reason IS NULL OR outcome_reason IN
           ('LOW_CONFIDENCE', 'UNANSWERABLE', 'NO_RULE', 'HUMAN_ONLY',
            'NOT_REACHED', 'TRIGGER_NOT_MET', 'SET_ASIDE'));

DROP INDEX IF EXISTS helix_check.ix_finding_case;
CREATE INDEX ix_finding_case ON helix_check.lc_finding (case_id, outcome);

-- `v_case_summary` counts by severity, so the column cannot go while it stands.
-- Dropped here and rebuilt by `R__views.sql`, which Flyway runs after every versioned
-- migration — that ordering is the whole reason the views live in a repeatable file.
-- `v_finding_decision` is not rebuilt at all: `v_finding_override` replaces it, and a
-- view left behind reading an action nothing writes would answer every query with
-- nothing and look like a case where the officer had decided none of it.
DROP VIEW IF EXISTS helix_check.v_case_summary CASCADE;
DROP VIEW IF EXISTS helix_check.v_finding_decision CASCADE;

ALTER TABLE helix_check.lc_finding DROP COLUMN severity;


-- ---- The case's own outcome ------------------------------------------------
--
-- NULL means "the derived value stands" — the same two slots a finding has, one
-- level up. Storing the derived value instead would freeze an answer that has to
-- move when an officer clears a discrepancy.
ALTER TABLE helix_check.lc_case ADD COLUMN decision_status TEXT
    CHECK (decision_status IS NULL OR decision_status IN ('DISCREPANT', 'FURTHER_CHECK', 'CLEAN'));


-- ---- The officer's own actions ---------------------------------------------
--
-- `action` is documented rather than constrained, deliberately — this table is the
-- file's memory of who did what, and a CHECK on it would make adding a new kind of
-- act a migration. `disposition` and `verdict` stay in the vocabulary because rows
-- carrying them already exist and are still true: it is append-only, so a migration
-- that rewrote them would be editing the record it exists to keep. Nothing writes
-- them from V22 on.
COMMENT ON COLUMN helix_check.lc_officer_action.action IS
    'outcome_override | outcome_override_cleared | decision_status | finding_note | '
    'raise_finding | unraise_finding | add_check | correct_fact | confirm_doc | '
    'reclassify_doc | gate_override | stop_policy | review_note | submit | run_stage | '
    'rerun_stage | disposition (retired V22) | verdict (retired V22)';
