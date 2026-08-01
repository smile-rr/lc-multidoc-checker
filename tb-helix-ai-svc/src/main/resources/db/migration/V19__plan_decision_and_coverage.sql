-- ----------------------------------------------------------------------------
-- The plan becomes an act of judgement, and says so.
--
-- Two things the plan stage now produces and had nowhere to put:
--
--   coverage            how well one planned check can be settled at all. Derived from
--                       the check's own tier when it is written, never a fourth axis the
--                       author maintains: an exact rule is DETERMINISTIC, a judged one
--                       SEMI_DETERMINISTIC, and HUMAN is the honest answer when nothing
--                       testable covers what the credit demanded.
--
--   suppressed_because  a standing rule set aside for THIS credit, and the clause that
--                       did it. Non-null is the whole difference between "the trigger
--                       was not met" and "the planner read :47A: and stood this down" —
--                       both are status SKIPPED, and only one of them needs explaining
--                       to an auditor.
--
-- `plan_decision` is one document rather than six columns. It holds the planner's whole
-- verdict for the case — the gate's outcome, what it suppressed and why, whether the
-- rest of the run is worth doing — and every part of it is read together or not at all.
-- Six columns would be six migrations the first time the planner learns to say one more
-- thing.
-- ----------------------------------------------------------------------------

ALTER TABLE helix_check.lc_plan_check
    ADD COLUMN coverage           TEXT
        CHECK (coverage IN ('DETERMINISTIC', 'SEMI_DETERMINISTIC', 'HUMAN')),
    ADD COLUMN suppressed_because TEXT;

ALTER TABLE helix_check.lc_case
    ADD COLUMN plan_decision JSONB;


-- A fourth provenance for a finding's wording, and the only one that is an absence of
-- wording: `planned` means the planner raised the question and nobody has answered it.
-- Not `derived` — nothing was computed. Not `drafted` — no model formed a view. Both of
-- those claim work that was not done, on the one kind of finding whose whole point is
-- that a person still has to do it.
ALTER TABLE helix_check.lc_finding
    DROP CONSTRAINT IF EXISTS lc_finding_statement_source_check;

ALTER TABLE helix_check.lc_finding
    ADD CONSTRAINT lc_finding_statement_source_check
    CHECK (statement_source IN ('derived', 'drafted', 'officer', 'planned'));
