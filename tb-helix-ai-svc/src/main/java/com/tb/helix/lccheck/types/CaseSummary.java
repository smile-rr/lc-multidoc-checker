package com.tb.helix.lccheck.types;

/**
 * One row of the cases list.
 *
 * <p>Deliberately smaller than {@link CaseDetail}: the list screen must never pull whole
 * documents to render a table.
 *
 * @param replyDueDays null when nothing is outstanding — computed, never stored, because a
 *                     stored countdown is wrong by morning
 */
public record CaseSummary(
        String id,
        String creditRef,
        String beneficiary,
        String currency,
        Number amount,
        Integer pageCount,
        String status,
        String statusLabel,
        Integer replyDueDays,
        boolean mine) {
}
