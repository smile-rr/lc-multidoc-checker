package com.tb.helix.lccheck.stage.intake;

/**
 * Which SWIFT message arrived.
 *
 * <p>A credit is rarely one message. The issue goes out as an MT700, overflows into an MT701
 * when {@code :45A:}/{@code :46A:}/{@code :47A:} run past the field limit, is changed by one
 * or more MT707s (themselves overflowing into MT708), and is accompanied by free-format
 * MT799s. All of them can sit in the same file, in the order they were sent.
 *
 * <p>This enum <b>labels</b> messages; it does not gate them. An unrecognised type is still
 * read — the reading is a model's, and a model handles a message shape we never enumerated
 * far better than a switch does. Refusing to read an unknown type was the old behaviour and
 * it threw away exactly the messages worth looking at.
 */
public enum SwiftMessageType {

    /** Issue of a documentary credit. The terms an examination is measured against. */
    MT700("700", "Issue of a documentary credit"),

    /**
     * Continuation of an MT700.
     *
     * <p>Not a message in its own right: the goods description or the conditions of the
     * credit above it, continued because the field ran out of room. Read together with the
     * 700 or its text is orphaned.
     */
    MT701("701", "Issue of a documentary credit (continued)"),

    /** Pre-advice. States terms the issue may not match — never the terms examined. */
    MT705("705", "Pre-advice of a documentary credit"),

    /**
     * Amendment.
     *
     * <p>Carries only what changed, so it is applied over a credit rather than read as one.
     * A field absent from a 707 means "unchanged", not "empty" — the distinction that makes
     * this its own type.
     */
    MT707("707", "Amendment to a documentary credit"),

    /** Continuation of an MT707, for the reason MT701 continues an MT700. */
    MT708("708", "Amendment to a documentary credit (continued)"),

    /** A third bank's credit, advised on. Carries terms the way a 700 does. */
    MT710("710", "Advice of a third bank's documentary credit"),

    /** Continuation of an MT710. */
    MT711("711", "Advice of a third bank's documentary credit (continued)"),

    /** Transfer to a second beneficiary. Restates the terms, sometimes changed. */
    MT720("720", "Transfer of a documentary credit"),

    /** Free format. Prose, no field structure worth parsing — but often where the truth is. */
    MT799("799", "Free format message"),

    /** Something else. Labelled honestly, and read anyway. */
    UNKNOWN("---", "Unrecognised message");

    private final String code;
    private final String label;

    SwiftMessageType(String code, String label) {
        this.code = code;
        this.label = label;
    }

    public String code() {
        return code;
    }

    public String label() {
        return label;
    }

    /** Whether this establishes terms, as opposed to changing or merely accompanying them. */
    public boolean isCredit() {
        return this == MT700 || this == MT710 || this == MT720;
    }

    /** Whether this changes terms already established. */
    public boolean isAmendment() {
        return this == MT707 || this == MT708;
    }

    /** Whether this is the overflow of the message above it rather than one of its own. */
    public boolean isContinuation() {
        return this == MT701 || this == MT708 || this == MT711;
    }

    public static SwiftMessageType of(String code) {
        if (code == null) return UNKNOWN;
        String c = code.trim();
        for (SwiftMessageType t : values()) {
            if (t.code.equals(c)) return t;
        }
        return UNKNOWN;
    }
}
