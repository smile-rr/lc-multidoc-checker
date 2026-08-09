package com.tb.helix.governance.types;

import java.util.List;
import java.util.Set;

/**
 * What an authored comparison asks for, and whether a machine can answer it.
 *
 * <p>The authoring console offers twenty operators grouped the way a checker thinks — text
 * and wording, amounts, dates, parties and places, presence. Most are arithmetic or string
 * work and settle the same way every time. Four are not, and pretending otherwise is the
 * trap this enum exists to avoid:
 *
 * <ul>
 *   <li>{@code noconflict} — "does not conflict with" is UCP 600 art. 14(d). Data need not
 *       be identical but must not conflict, and deciding whether "WIDGETS, MODEL IW-2024"
 *       conflicts with "INDUSTRIAL WIDGETS" is the examiner's judgement, not a string
 *       comparison.
 *   <li>{@code same_party} — "ACME TRADING CO LTD" and "Acme Trading Company Limited" are
 *       the same party. A comparison that says otherwise is wrong more often than right.
 *   <li>{@code same_country}, {@code addr_same_country} — needs to know that Kowloon is in
 *       Hong Kong.
 * </ul>
 *
 * <p>A check using one of those is <em>routed to the judged path</em> rather than answered
 * by string comparison. It is not a failure and not a gap: the author expressed a judgement,
 * so a judge makes it. What must never happen is a judgement being implemented as
 * {@code contains} and reported as deterministic — an examiner reading "exact" on a finding
 * is being told a machine settled it.
 *
 * <h2>Why this lives in governance</h2>
 *
 * <p>Because the console authors conditions, so the operators a condition may use are part
 * of the rulebook's vocabulary, exactly like {@link CheckType} beside it. lc-check reads it
 * and evaluates; it does not get to invent one.
 *
 * <p><b>And because there were three copies.</b> The wire names lived here, the human labels
 * and their grouping lived in the browser's store, and a third hand-written list described
 * them to the planner — three lists, maintained by hand, that had to agree about twenty
 * things. {@link #describe()} and {@link #label()} are why there is now one: the API serves
 * this enum, the console renders what it is given, and the prompt is generated from it.
 *
 * @see ConditionTree
 */
public enum Operator {

    // --- Text ---------------------------------------------------------------
    EQ("eq", "equals", Group.TEXT, "text is the same"),
    NE("ne", "differs from", Group.TEXT, "text differs"),
    CONTAINS("contains", "contains", Group.TEXT, "the left text contains the right"),
    ONEOF("oneof", "is one of", Group.TEXT,
            "the left value is one of a comma-separated right list"),

    // --- Amounts ------------------------------------------------------------
    N_EQ("n_eq", "equals (amount)", Group.AMOUNT, "amounts are equal"),
    LTE("lte", "is at most", Group.AMOUNT, "the left amount is at most the right", true),
    GTE("gte", "is at least", Group.AMOUNT, "the left amount is at least the right"),
    // Strictly, and they were missing. "At most" is not "less than", and a rule about a
    // shipment LATER than the latest shipment date could not be written down at all — it had
    // to be spelled as the negation of `d_lte`, which the tree language has no way to say.
    LT("lt", "is less than", Group.AMOUNT, "the left amount is strictly less than the right"),
    GT("gt", "is more than", Group.AMOUNT, "the left amount is strictly more than the right"),
    WITHIN_PCT("within_pct", "is within tolerance of", Group.AMOUNT,
            "the left amount is within tol percent of the right", true),

    // --- Dates --------------------------------------------------------------
    D_LTE("d_lte", "is on or before", Group.DATE, "the left date is on or before the right"),
    D_GTE("d_gte", "is on or after", Group.DATE, "the left date is on or after the right"),
    D_LT("d_lt", "is before", Group.DATE, "the left date is strictly before the right"),
    D_GT("d_gt", "is after", Group.DATE, "the left date is strictly after the right"),
    D_EQ("d_eq", "is the same date as", Group.DATE, "the dates are the same day"),
    D_WITHIN("d_within", "is within", Group.DATE,
            "the left date is within tol days of the right", true),

    // --- Presence and expression --------------------------------------------
    PRESENT("present", "is stated", Group.PRESENCE,
            "the left field is stated at all (no right side)"),
    ABSENT("absent", "is not stated", Group.PRESENCE,
            "the left field is not stated (no right side)"),
    MATCHES("matches", "satisfies expression", Group.PRESENCE,
            "the left text matches the right regular expression"),
    NMATCHES("nmatches", "does not satisfy expression", Group.PRESENCE,
            "the left text does not match the right regular expression"),

    // --- Judgement, expressed as an operator --------------------------------
    NOCONFLICT("noconflict", "does not conflict with", Group.PARTY, null),
    SAME_PARTY("same_party", "is the same party as", Group.PARTY, null),
    SAME_COUNTRY("same_country", "is in the same country as", Group.PARTY, null),
    ADDR_SAME_COUNTRY("addr_same_country", "address agrees (same country is enough)",
            Group.PARTY, null),

    /** An operator the console offers and this does not know. Never guessed at. */
    UNKNOWN("", "unknown", Group.PRESENCE, null);

    /** How the console groups them — the way a checker thinks, not by data type. */
    public enum Group {
        TEXT("Text & wording"),
        AMOUNT("Amounts & quantities"),
        DATE("Dates"),
        PARTY("Parties, places & countries"),
        PRESENCE("Presence & expression");

        private final String label;

        Group(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    private static final Set<Operator> JUDGEMENT =
            Set.of(NOCONFLICT, SAME_PARTY, SAME_COUNTRY, ADDR_SAME_COUNTRY);

    private static final Set<Operator> UNARY = Set.of(PRESENT, ABSENT);

    /** The right-hand side is a pattern, not a field — so the console offers no field picker. */
    private static final Set<Operator> LITERAL_RIGHT = Set.of(MATCHES, NMATCHES);

    private final String wire;
    private final String label;
    private final Group group;
    private final String describe;
    private final boolean usesTol;

    Operator(String wire, String label, Group group, String describe) {
        this(wire, label, group, describe, false);
    }

    Operator(String wire, String label, Group group, String describe, boolean usesTol) {
        this.wire = wire;
        this.label = label;
        this.group = group;
        this.describe = describe;
        this.usesTol = usesTol;
    }

    public String wire() {
        return wire;
    }

    /** How an author reads it: "is on or before". Never phrased a second time in Java. */
    public String label() {
        return label;
    }

    public Group group() {
        return group;
    }

    /** How it is explained to a model, or null for one a model may not use. */
    public String describe() {
        return describe;
    }

    /**
     * Whether the qualifier box means anything here.
     *
     * <p>Three operators read it — {@code lte} allows a tolerance over the limit,
     * {@code within_pct} and {@code d_within} are nothing without one. Every other operator
     * <em>ignores</em> whatever is typed there, and that is worth saying out loud: the
     * seeded cross-document check compares two goods descriptions with {@code eq} and the
     * qualifier "corresponds, not identical", which reads like an instruction and is
     * discarded. The comparison actually run is a strict string equality.
     */
    public boolean usesTol() {
        return usesTol;
    }

    /** Whether settling this needs an examiner rather than a comparison. */
    public boolean needsJudgement() {
        return JUDGEMENT.contains(this);
    }

    /** Whether it reads one operand rather than two. */
    public boolean unary() {
        return UNARY.contains(this);
    }

    /** Whether the right-hand side may only be a fixed value. */
    public boolean literalRight() {
        return LITERAL_RIGHT.contains(this);
    }

    /** Whether a machine can settle it here. */
    public boolean decidable() {
        return this != UNKNOWN && !needsJudgement();
    }

    /** Everything an author may choose, which is everything but {@link #UNKNOWN}. */
    public static List<Operator> authorable() {
        return List.of(values()).stream().filter(o -> o != UNKNOWN).toList();
    }

    public static Operator of(String wire) {
        if (wire == null) return UNKNOWN;
        String w = wire.trim().toLowerCase();
        for (Operator o : values()) {
            if (o.wire.equals(w)) return o;
        }
        return UNKNOWN;
    }
}
