package com.tb.helix.lccheck.stage.intake;

/**
 * Which SWIFT message arrived.
 *
 * <p>A case is not always opened by an MT700. Amendments arrive as MT707 and change terms
 * an examination is already measuring against; free-format MT799 carries everything the
 * structured types cannot say. Treating all three as "the credit" would let an amendment's
 * expiry silently overwrite the original's, and would make a covering message look like a
 * credit with almost every field missing.
 */
public enum SwiftMessageType {

    /** Issue of a documentary credit. The terms an examination is measured against. */
    MT700("700", "Issue of a documentary credit"),

    /**
     * Amendment.
     *
     * <p>Carries only what changed, so it is applied over a credit rather than read as one.
     * A field absent from a 707 means "unchanged", not "empty" — the distinction that makes
     * this its own type.
     */
    MT707("707", "Amendment to a documentary credit"),

    /** Free format. Prose, no field structure worth parsing. */
    MT799("799", "Free format message"),

    /** Something else, or nothing recognisable. Read but never treated as terms. */
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

    /** Whether this defines the terms, as opposed to changing or merely accompanying them. */
    public boolean isCredit() {
        return this == MT700;
    }

    /** Whether this changes terms already established. */
    public boolean isAmendment() {
        return this == MT707;
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
