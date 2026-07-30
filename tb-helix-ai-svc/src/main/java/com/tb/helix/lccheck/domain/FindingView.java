package com.tb.helix.lccheck.domain;

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
 */
public record FindingView(
        String id,
        String severity,
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
        List<?> trace) {
}
