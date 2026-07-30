package com.tb.helix.governance.domain;

/**
 * How much a failure matters.
 *
 * <p>The author's judgement about the rule, not the engine's about one presentation — a
 * CRITICAL check that passes raises nothing.
 */
public enum Severity {

    /** Alone makes the presentation non-complying. */
    CRITICAL,

    /** A discrepancy. It goes in the notice. */
    MAJOR,

    /** A formality. Worth saying, rarely worth refusing over. */
    MINOR;

    public static Severity of(String value) {
        if (value == null) return MAJOR;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return MAJOR;
        }
    }
}
