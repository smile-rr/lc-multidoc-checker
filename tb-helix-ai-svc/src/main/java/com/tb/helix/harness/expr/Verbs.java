package com.tb.helix.harness.expr;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The verbs that ship with the engine, because they are true everywhere.
 *
 * <p>How many days apart two dates are does not depend on what the dates mean. Whether two
 * company names denote the same party does — so that one is not here, and belongs to whoever
 * knows what a party is.
 *
 * <p>Every one of them returns {@code null} rather than throwing, for the same reason: an
 * argument that could not be used makes a leaf <em>unknown</em>, and an unknown leaf is a
 * fact about the evidence. An exception would make it a fact about the run.
 */
public final class Verbs {

    private Verbs() {
    }

    /** How long a regular expression may be before it is refused rather than run. */
    private static final int MAX_PATTERN = 200;

    public static List<VerbSpec> standard() {
        return List.of(
                // --- text -------------------------------------------------------
                VerbSpec.bool("same", 2,
                        "two texts are the same, ignoring case, punctuation spacing and line breaks",
                        a -> both(a, (x, y) -> norm(x).equals(norm(y)))),
                VerbSpec.bool("differs", 2,
                        "two texts are not the same, compared the way #same compares them",
                        a -> both(a, (x, y) -> !norm(x).equals(norm(y)))),
                VerbSpec.bool("contains", 2,
                        "the first text contains the second",
                        a -> both(a, (x, y) -> norm(x).contains(norm(y)))),
                VerbSpec.bool("oneOf", 2,
                        "the first text is one of the second, which is a separated list",
                        a -> both(a, Verbs::oneOf)),
                VerbSpec.bool("matches", 2,
                        "the first text matches the second as a regular expression",
                        a -> both(a, (x, y) -> regex(x, y, true))),
                VerbSpec.bool("notMatches", 2,
                        "the first text does not match the second as a regular expression",
                        a -> both(a, (x, y) -> regex(x, y, false))),

                // --- presence ---------------------------------------------------
                //
                // The only two verbs that answer BECAUSE a value is missing, so they take the
                // raw argument and are the one place a null is an answer rather than an
                // unknown. Everything else short-circuits before it is called.
                VerbSpec.bool("present", 1,
                        "this was read at all",
                        a -> a.get(0) != null && !String.valueOf(a.get(0)).isBlank()),
                VerbSpec.bool("absent", 1,
                        "this was not read at all",
                        a -> a.get(0) == null || String.valueOf(a.get(0)).isBlank()),

                // --- numbers ----------------------------------------------------
                VerbSpec.bool("atMost", 3,
                        "the first amount is at most the second, allowing the third as a percentage",
                        a -> {
                            BigDecimal x = num(a.get(0));
                            BigDecimal y = num(a.get(1));
                            BigDecimal pct = num(a.get(2));
                            if (x == null || y == null || pct == null) return null;
                            return x.compareTo(allowing(y, pct)) <= 0;
                        }),
                VerbSpec.bool("withinPct", 3,
                        "two amounts are within the third as a percentage of the second",
                        a -> {
                            BigDecimal x = num(a.get(0));
                            BigDecimal y = num(a.get(1));
                            BigDecimal pct = num(a.get(2));
                            if (x == null || y == null || pct == null) return null;
                            BigDecimal room = y.abs().multiply(pct).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
                            return x.subtract(y).abs().compareTo(room) <= 0;
                        }),
                VerbSpec.value("pctOf", 2,
                        "that percentage of an amount",
                        a -> {
                            BigDecimal x = num(a.get(0));
                            BigDecimal pct = num(a.get(1));
                            return x == null || pct == null ? null
                                    : x.multiply(pct).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
                        }),
                VerbSpec.value("sumOf", -1,
                        "two or more amounts added together",
                        a -> {
                            BigDecimal total = BigDecimal.ZERO;
                            for (Object o : a) {
                                BigDecimal v = num(o);
                                if (v == null) return null;
                                total = total.add(v);
                            }
                            return total;
                        }),
                VerbSpec.value("productOf", 2,
                        "two amounts multiplied — a quantity times a unit price",
                        a -> {
                            BigDecimal x = num(a.get(0));
                            BigDecimal y = num(a.get(1));
                            return x == null || y == null ? null : x.multiply(y);
                        }),

                // --- dates ------------------------------------------------------
                VerbSpec.value("datePlus", 2,
                        "the date that many calendar days later",
                        a -> shift(a, 1)),
                VerbSpec.value("dateMinus", 2,
                        "the date that many calendar days earlier",
                        a -> shift(a, -1)),
                VerbSpec.value("daysBetween", 2,
                        "how many calendar days apart two dates are, never negative",
                        a -> {
                            LocalDate x = date(a.get(0));
                            LocalDate y = date(a.get(1));
                            return x == null || y == null ? null
                                    : BigDecimal.valueOf(Math.abs(ChronoUnit.DAYS.between(x, y)));
                        }),
                VerbSpec.bool("withinDays", 3,
                        "two dates are within that many calendar days of each other",
                        a -> {
                            LocalDate x = date(a.get(0));
                            LocalDate y = date(a.get(1));
                            BigDecimal days = num(a.get(2));
                            if (x == null || y == null || days == null) return null;
                            return Math.abs(ChronoUnit.DAYS.between(x, y)) <= days.longValue();
                        }));
    }

    // --- coercion, and it never guesses -------------------------------------
    //
    // A caller binds typed values — a date as a LocalDate, an amount as a BigDecimal. These
    // accept a string too, because a console's simulator has a person typing into a box and
    // refusing them would make the feature useless. What none of them does is invent: an
    // argument that will not read is null, and null makes the leaf unknown.
    //
    // The reading itself is Values', not ours. These grew their own copy of the SWIFT comma
    // rule and none of the written-date forms, so `20 - August - 2010` bound fine as a fact
    // and was unusable the moment a verb touched it.

    private static Boolean both(List<Object> a, java.util.function.BiFunction<String, String, Boolean> f) {
        if (a.get(0) == null || a.get(1) == null) return null;
        return f.apply(String.valueOf(a.get(0)), String.valueOf(a.get(1)));
    }

    static BigDecimal num(Object o) {
        if (o == null) return null;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return new BigDecimal(n.toString());
        return Values.number(String.valueOf(o));
    }

    static LocalDate date(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate d) return d;
        return Values.date(String.valueOf(o));
    }

    private static LocalDate shift(List<Object> a, int sign) {
        LocalDate d = date(a.get(0));
        BigDecimal n = num(a.get(1));
        return d == null || n == null ? null : d.plusDays(sign * n.longValue());
    }

    private static BigDecimal allowing(BigDecimal base, BigDecimal pct) {
        return base.add(base.abs().multiply(pct).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
    }

    private static boolean oneOf(String value, String list) {
        for (String part : list.split("[,;|/]")) {
            if (norm(part).equals(norm(value))) return true;
        }
        return false;
    }

    private static Boolean regex(String value, String pattern, boolean want) {
        // A pattern an author or a model wrote, run against text we did not choose. Length is
        // the cheap half of the guard against one that backtracks for ever; the rest is that
        // a refused pattern is unknown rather than false.
        if (pattern.length() > MAX_PATTERN) return null;
        try {
            return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(value).find() == want;
        } catch (Exception e) {
            return null;
        }
    }

    /** Case, punctuation spacing and line breaks folded away; nothing else. */
    static String norm(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").strip().toLowerCase(Locale.ROOT);
    }
}
