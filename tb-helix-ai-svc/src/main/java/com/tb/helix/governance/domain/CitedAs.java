package com.tb.helix.governance.domain;

/**
 * What a check is answerable to — the "Cited as" column.
 *
 * <p>Distinct from {@link Origin}: a rule card from the dictionary may cite the credit, and
 * a requirement read from the credit may rest on practice. Where a rule came from and what
 * it stands on are different facts.
 */
public enum CitedAs {

    /** The credit says so. Non-negotiable. */
    CREDIT("credit"),

    /** UCP 600 or ISBP 821. Refusable, and citable in the advice. */
    PRACTICE("practice"),

    /** The bank's own policy. Refusable internally; not a discrepancy under the credit. */
    POLICY("policy");

    private final String wire;

    CitedAs(String wire) {
        this.wire = wire;
    }

    public String wire() {
        return wire;
    }

    public static CitedAs of(String value) {
        if (value == null) return PRACTICE;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return PRACTICE;
        }
    }
}
