package com.tb.helix.lccheck.domain;

/**
 * What the credit says, as the workbench shows it.
 *
 * <p>A record rather than a map because these are the terms every check is measured
 * against, and a typo in a key would silently produce a check that compares nothing.
 */
public record CreditTerms(
        String creditRef,
        String issuedDate,
        String applicant,
        String beneficiary,
        String currency,
        Number amount,
        Number tolerancePct,
        String latestShipment,
        String expiry,
        String expiryPlace,
        Integer presentationDays,
        String tenor,
        String goods) {
}
