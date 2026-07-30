package com.tb.helix.lccheck.types.examination;

/**
 * Who can answer for a check.
 *
 * <p>The grouping the officer sees on the plan and in the findings list, because it decides
 * who to go to when a conclusion is disputed.
 */
public enum Origin {

    /** A standing rule card, authored in Governance and reviewed before it ever ran. */
    DICTIONARY("dictionary"),

    /** A requirement card, read out of this credit's own terms during the run. Reviewed by nobody. */
    CREDIT("credit"),

    /** Something a person added to this case, recorded against their name. */
    OFFICER("officer");

    private final String wire;

    Origin(String wire) {
        this.wire = wire;
    }

    public String wire() {
        return wire;
    }

    public static Origin of(String value) {
        if (value == null) return DICTIONARY;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return DICTIONARY;
        }
    }
}
