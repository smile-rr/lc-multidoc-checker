package com.tb.helix.governance.types;

import java.util.List;

/**
 * The values a condition may work out for itself.
 *
 * <p>An operand used to be one of two things: a field on a document, or a value the credit
 * states. That covers most of what a credit demands and misses the part that matters most in
 * UCP 600 — <b>art. 14(c)</b>, twenty-one days from the date of shipment. There is no field
 * called "twenty-one days after the on-board date". It is an on-board date, a number, and an
 * addition, and until this existed the only way to express it was to hand the whole question
 * to a model and get an opinion about arithmetic back.
 *
 * <p>So there is a third operand: a named function over other operands. Note what it is
 * <em>not</em> — an expression language. There are eight functions, each with a fixed arity
 * and a stated meaning, and a planner or an author may use those eight and nothing else. That
 * is the difference between something a compiler can validate before it runs and something
 * that can only be validated by running it, which is the whole reason this project does not
 * take a general expression evaluator.
 *
 * <h2>Absence propagates</h2>
 *
 * <p>Every function returns nothing when any argument is missing, and a comparison against
 * nothing is INCONCLUSIVE rather than false. A date arithmetic that treated an unread
 * on-board date as day zero would report a presentation twenty-one days late on a document
 * nobody could read.
 */
public enum ConditionFn {

    /** {@code date_plus(date, days)} — the date that many calendar days later. */
    DATE_PLUS("date_plus", 2, "a date, plus a number of calendar days"),

    /** {@code date_minus(date, days)} — the date that many calendar days earlier. */
    DATE_MINUS("date_minus", 2, "a date, minus a number of calendar days"),

    /** {@code days_between(a, b)} — whole days apart, never negative. */
    DAYS_BETWEEN("days_between", 2, "how many calendar days apart two dates are"),

    /** {@code pct_of(amount, percent)} — that percentage of the amount. */
    PCT_OF("pct_of", 2, "a percentage of an amount"),

    /** {@code sum_of(a, b, …)} — the total. Two or more. */
    SUM_OF("sum_of", -1, "two or more amounts added together"),

    /** {@code product_of(a, b)} — quantity times unit price, and nothing else so far. */
    PRODUCT_OF("product_of", 2, "two amounts multiplied — quantity times unit price"),

    /** {@code num_of(text)} — the number inside "USD 60,000.00". */
    NUM_OF("num_of", 1, "the number inside a value written with a currency or separators"),

    /**
     * {@code party_of(text)} — a company name with its legal form removed.
     *
     * <p>"ACME TRADING CO., LTD." and "Acme Trading Company Limited" become the same string.
     * It is the same normalisation the {@code same_party} operator tries before it gives up
     * and asks an examiner, offered here so an author can write the comparison outright.
     */
    PARTY_OF("party_of", 1, "a company name with punctuation, case and legal form removed");

    private final String wire;
    private final int arity;
    private final String describe;

    ConditionFn(String wire, int arity, String describe) {
        this.wire = wire;
        this.arity = arity;
        this.describe = describe;
    }

    public String wire() {
        return wire;
    }

    /** How many arguments, or {@code -1} for two or more. */
    public int arity() {
        return arity;
    }

    public String describe() {
        return describe;
    }

    public boolean accepts(int count) {
        return arity < 0 ? count >= 2 : count == arity;
    }

    /** What to say when it does not. Written for the author who has to fix it. */
    public String arityComplaint(int count) {
        return arity < 0
                ? wire + " needs two or more values and was given " + count
                : wire + " needs " + arity + (arity == 1 ? " value" : " values") + " and was given " + count;
    }

    public static List<ConditionFn> all() {
        return List.of(values());
    }

    public static ConditionFn of(String wire) {
        if (wire == null) return null;
        String w = wire.trim().toLowerCase();
        for (ConditionFn f : values()) {
            if (f.wire.equals(w)) return f;
        }
        return null;
    }
}
