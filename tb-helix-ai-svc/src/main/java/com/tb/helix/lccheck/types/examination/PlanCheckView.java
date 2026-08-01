package com.tb.helix.lccheck.types.examination;

import java.util.List;
import java.util.Map;

/**
 * One check in the plan for a case.
 *
 * <p>Three orthogonal things travel together here, and the workbench reads each
 * differently:
 *
 * <ul>
 *   <li>{@code origin} — the grouping. Who can answer for this: the dictionary, this
 *       credit, or the officer.
 *   <li>{@code tier} — a mark on the row. Exact is reproducible and free; judged cost money
 *       and a view was formed.
 *   <li>{@code source} — the citation column. Whether it is required by the credit,
 *       standard practice, or bank policy.
 * </ul>
 *
 * @param areaId     null means the trigger was not met — recorded, never a silent omission
 * @param notCovered the planner found a demand no standing rule tests: a gap in the rulebook
 * @param coverage   how well this can be settled at all — {@code deterministic},
 *                   {@code semi-deterministic} or {@code human}. Derived from the tier when
 *                   the check was planned, so it is a restatement rather than a fourth axis
 *                   an author has to keep in step. It is what the requirement group sorts by,
 *                   because "how much of what this credit demands can be tested" is the one
 *                   question that group is asked.
 * @param suppressedBecause the clause of <em>this</em> credit that stood a standing rule
 *                   down, when one did. Null for every other kind of skip — which is what
 *                   makes the two distinguishable, since both are a check that did not run.
 * @param docCodes   which documents this check looks at. Empty means the presentation as a
 *                   whole, which is an answer rather than a gap.
 * @param findingId  what it produced, once it has run. Null before that, and null for a
 *                   check that produced nothing.
 *                   <p>This was missing, and every settled check therefore read "passed" on
 *                   the plan — including the threshold check that had just refused the
 *                   presentation. The screen looks a finding up by this id; without it the
 *                   lookup returned nothing and "nothing found" rendered as "nothing wrong".
 */
public record PlanCheckView(
        String id,
        String name,
        String areaId,
        String appliesBecause,
        String ruleRef,
        boolean addedByOfficer,
        boolean plannedByLlm,
        boolean notCovered,
        String tier,
        String origin,
        boolean gate,
        String source,
        String checkType,
        String executionPlan,
        String coverage,
        String suppressedBecause,
        List<String> docCodes,
        String findingId,
        Map<String, Object> spec) {
}
