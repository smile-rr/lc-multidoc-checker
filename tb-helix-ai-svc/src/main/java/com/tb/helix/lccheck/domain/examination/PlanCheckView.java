package com.tb.helix.lccheck.domain.examination;

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
        Map<String, Object> spec) {
}
