package com.tb.helix.lccheck.api.dto;

/**
 * The decision on the presentation as a whole.
 *
 * @param verdict refuse | waiver | second
 * @param note    the covering note that travels with it
 */
public record SignoffRequest(String verdict, String note) {
}
