package com.tb.helix.lccheck.api.dto;

/**
 * The decision on the presentation as a whole.
 *
 * <p>This used to carry {@code refuse | waiver | second} — two outcomes and an action mixed on
 * one axis, none of them computed from anything the examination found. The status is now derived
 * from the findings' outcomes and sent back only because the officer may disagree with the
 * arithmetic; take-up-subject-to-waiver came back as an act under {@code DISCREPANT}, since
 * asking for a waiver does not change what was found.
 *
 * @param status {@code DISCREPANT} · {@code FURTHER_CHECK} · {@code CLEAN}
 * @param note   the covering note that travels with it
 */
public record SignoffRequest(String status, String note) {
}
