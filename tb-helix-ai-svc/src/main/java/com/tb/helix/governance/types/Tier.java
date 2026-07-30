package com.tb.helix.governance.types;

/**
 * How much to trust an answer, and what it cost to get.
 *
 * <p>A mark on a row rather than a grouping. Findings group by <em>provenance</em> — who can
 * answer for them — because that decides who to ask; the tier decides how much reading a
 * row deserves, which is a different question and belongs beside the row, not around it.
 */
public enum Tier {

    /** An expression over fields. Reproducible, free, the same answer every time. */
    EXACT,

    /** A model formed a view. It cost money and it should be read before it is relied on. */
    JUDGED;

    public String wire() {
        return name().toLowerCase();
    }

    public static Tier of(String value) {
        return value != null && value.trim().equalsIgnoreCase("EXACT") ? EXACT : JUDGED;
    }
}
