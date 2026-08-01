package com.tb.helix.lccheck.api.dto;

/**
 * The officer overruling the engine on one finding.
 *
 * <p>The engine's own outcome is not touched. This is recorded beside it, as an append to
 * {@code lc_officer_action}, because the interesting fact in an examination file is the pair:
 * the engine called it discrepant and a named person cleared it at a stated time. One column
 * could not hold that, and a file that cannot show it is not a record of a review.
 *
 * @param outcome {@code CLEAN} or {@code DISCREPANT} — the only two an officer may write.
 *                Never {@code DOUBT}, which is the engine reporting the limit of its own reach
 *                rather than a confidence a person records, and never {@code NOT_RUN}, which is
 *                the absence of a run and nothing asserts it.
 * @param by      who made the call, for the mark the workbench puts on the row.
 * @param note    why. Optional, and the most valuable field on a cleared discrepancy — that is
 *                the one a checker will ask about.
 */
public record OutcomeOverrideRequest(String outcome, String by, String note) {
}
