package com.tb.helix.lccheck.types.examination;

import java.util.List;
import java.util.Map;

/**
 * A single conclusion, with everything needed to defend it.
 *
 * <p>{@code expected} and {@code quote} are the two sides of the comparison the officer is
 * being asked to confirm; {@code reason} is the rule that makes the difference matter.
 *
 * <p>{@code title} and {@code statement} are both here and are not the same thing: a title
 * is what you scan a list with, a statement is the formal wording that goes out in a
 * refusal advice under field 77J.
 *
 * <p>{@code origin}, {@code settledBy} and {@code checkType} are read through the plan check
 * that produced it rather than stored again, so a finding cannot drift from its check.
 *
 * <p>{@code outcome} is {@code DISCREPANT}, {@code DOUBT} or {@code CLEAN} — never
 * {@code NOT_RUN}, because a finding <em>is</em> a result and its existence is what says the
 * check ran. It is the engine's own value and stays that way: an officer disagreeing is
 * recorded beside it, and the workbench resolves the pair. {@code outcomeReason} is set only
 * where the outcome is an absence rather than a conclusion, and names which kind.
 */
public record FindingView(
        String id,
        String outcome,
        String outcomeReason,
        String area,
        String areaId,
        String checkId,
        String docId,
        Integer page,
        String anchorId,
        String creditAnchorId,
        String title,
        String statement,
        String statementSource,
        String detail,
        String expected,
        String quote,
        String quoteSource,
        String reason,
        boolean raisedByOfficer,
        String settledBy,
        String origin,
        String checkType,
        String source,
        Map<String, Object> analysis,
        /**
         * The rows an exact check compared, or null when a model settled it.
         *
         * <p>Not a rendering of the outcome — the outcome is one word and this is the
         * working behind it. A judged finding has {@code analysis} instead, which is a view
         * somebody formed; the two are never both present and the difference is the point.
         */
        ComparisonView comparison,
        List<?> trace) {
}
