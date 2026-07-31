package com.tb.helix.lccheck.rule;

import java.util.Set;

/**
 * What an authored comparison asks for, and whether a machine can answer it.
 *
 * <p>The authoring console offers twenty-one operators grouped the way a checker thinks —
 * text and wording, amounts, dates, parties and places, presence. Most are arithmetic or
 * string work and settle the same way every time. Four are not, and pretending otherwise is
 * the trap this enum exists to avoid:
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
 * here. It is not a failure and not a gap: the author expressed a judgement, so a judge
 * makes it. What must never happen is this class quietly implementing {@code noconflict} as
 * {@code contains} and reporting the result as deterministic — an examiner reading "exact"
 * on a finding is being told a machine settled it.
 */
public enum Operator {

    // --- Text ---------------------------------------------------------------
    EQ("eq"),
    NE("ne"),
    CONTAINS("contains"),
    ONEOF("oneof"),

    // --- Amounts ------------------------------------------------------------
    N_EQ("n_eq"),
    LTE("lte"),
    GTE("gte"),
    WITHIN_PCT("within_pct"),

    // --- Dates --------------------------------------------------------------
    D_LTE("d_lte"),
    D_GTE("d_gte"),
    D_EQ("d_eq"),
    D_WITHIN("d_within"),

    // --- Presence and expression --------------------------------------------
    PRESENT("present"),
    ABSENT("absent"),
    MATCHES("matches"),
    NMATCHES("nmatches"),

    // --- Judgement, expressed as an operator --------------------------------
    NOCONFLICT("noconflict"),
    SAME_PARTY("same_party"),
    SAME_COUNTRY("same_country"),
    ADDR_SAME_COUNTRY("addr_same_country"),

    /** An operator the console offers and this does not know. Never guessed at. */
    UNKNOWN("");

    private static final Set<Operator> JUDGEMENT =
            Set.of(NOCONFLICT, SAME_PARTY, SAME_COUNTRY, ADDR_SAME_COUNTRY);

    private static final Set<Operator> UNARY = Set.of(PRESENT, ABSENT);

    private final String wire;

    Operator(String wire) {
        this.wire = wire;
    }

    public String wire() {
        return wire;
    }

    /** Whether settling this needs an examiner rather than a comparison. */
    public boolean needsJudgement() {
        return JUDGEMENT.contains(this);
    }

    /** Whether it reads one operand rather than two. */
    public boolean unary() {
        return UNARY.contains(this);
    }

    /** Whether a machine can settle it here. */
    public boolean decidable() {
        return this != UNKNOWN && !needsJudgement();
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
