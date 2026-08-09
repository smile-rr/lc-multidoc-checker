-- A credit that restates a standing rule on its own terms is not a second requirement.
--
-- UCP 600 art. 14(c) allows 21 calendar days for presentation. A credit saying "documents
-- may be presented within 30 days after the date of shipment" has not added a demand — it
-- has changed the number in one the rulebook already makes. Until now the plan held both:
-- the standing rule as authored, and a REQ-47A.n card compiled out of the clause, each
-- running and each capable of raising its own discrepancy about one fact.
--
-- The only verb that could reconcile them was `suppress`, and it is the wrong one. It means
-- "the credit excused this check" — it stands the rule down and raises a card asking a
-- person to confirm the excusal. Nothing was excused here. A rule was restated and still
-- applies, so it should still run: on the credit's terms, under the article's citation, as
-- one card and one finding.
--
-- WHICH CARD SURVIVES, AND WHY IT IS THE STANDING ONE. Three things live on it and nowhere
-- else. The citation — a refusal states a ground under an article, and a REQ- card carries a
-- tag number instead. The examiner remit — judged checks group by the standing card's
-- domain, while a credit-origin card short-circuits to a synthetic one, so merging the other
-- way would move a check out of the remit of the person who should answer it. And the
-- identity across cases: TRANS-20 is the same id on every presentation, so "how often does a
-- credit vary the presentation period" is answerable; REQ-47A.3 is a different clause every
-- time and answers nothing.
--
-- WHICH ROW. A standing check is not one subject — the seeded TRANS-20 carries four, and a
-- clause about the presentation period varies exactly one of them. So the replacement is per
-- ROW, and which row is settled in code by matching the left operand, never by a model naming
-- one. `varied_from` keeps the row that was replaced, because a variation an officer cannot
-- see is a variation nobody agreed to.

ALTER TABLE helix_check.lc_plan_check
    -- On the standing card: the requirement whose condition replaced a row of this one.
    ADD COLUMN varied_by    TEXT,
    -- The credit's own words, so the variation can be checked against the credit.
    ADD COLUMN varied_quote TEXT,
    -- The row as authored, before the credit replaced it.
    ADD COLUMN varied_from  JSONB,
    -- On the requirement card: the standing check it was folded into.
    ADD COLUMN merged_into  TEXT;

COMMENT ON COLUMN helix_check.lc_plan_check.varied_by IS
    'The REQ- card whose compiled condition replaced a row of this standing check.';
COMMENT ON COLUMN helix_check.lc_plan_check.varied_from IS
    'The row this check carried before the credit varied it. Kept so an officer can see 21 became 30.';
COMMENT ON COLUMN helix_check.lc_plan_check.merged_into IS
    'Set on a requirement card that was folded into a standing check. Its status is MERGED and it does not run.';

-- MERGED is a fourth resting state beside SKIPPED, and it is not the same thing.
-- SKIPPED is "this did not run"; MERGED is "this ran, under another id" — the difference an
-- officer needs when asking why a requirement they can see has no finding of its own.
ALTER TABLE helix_check.lc_plan_check
    DROP CONSTRAINT lc_plan_check_status_check;

ALTER TABLE helix_check.lc_plan_check
    ADD CONSTRAINT lc_plan_check_status_check
    CHECK (status IN ('PLANNED', 'SKIPPED', 'MERGED', 'RUNNING', 'DONE', 'FAILED'));
