package com.tb.helix.lccheck.rule;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Settling an authored rule against what the documents said.
 *
 * <p>The tree an author builds in the console — groups of rows, each comparing a field on
 * one document with a field on another — was stored, copied onto the case, and never
 * evaluated. The one comparison the system actually performed was written out longhand in
 * Java inside the gate stage, with a comment admitting it bypassed "the general SpEL path".
 * There was no general path. Everything else went to a model with a page of facts and a
 * request to use its judgement, including {@code invoice value is at most credit amount}.
 *
 * <p>Three outcomes, and the third is the one that matters most:
 *
 * <ul>
 *   <li><b>PASS</b> / <b>FAIL</b> — the comparison settled it.
 *   <li><b>INCONCLUSIVE</b> — it could not be settled here, and the row says why: a document
 *       was not presented, a field was not read from it, or the author asked a question that
 *       needs judgement. "We did not check that" is an answer an examiner must be able to
 *       give; a rule that silently passes when its operand is missing reports a clean
 *       presentation nobody examined.
 * </ul>
 *
 * <p>Every row is evaluated even after one fails, because the officer is shown the whole
 * comparison and stopping early would leave the rest blank for no saving worth having.
 */
@Component
public class RuleEvaluator {

    public enum Outcome { PASS, FAIL, INCONCLUSIVE }

    /**
     * One reading, as this needs it.
     *
     * <p>Its own type rather than the persistence row, and the build enforces that: a rule
     * engine coupled to column names would turn a schema rename into a change in how an
     * examination is decided. Four values are all a comparison needs — which field, on which
     * document, what it says, and what to call it when explaining itself.
     */
    public record Fact(String fieldKey, String docCode, String label, String value) {
    }

    /**
     * How one comparison came out.
     *
     * @param op    the operator as authored. Carried rather than phrased here: "is on or
     *              before" is the console's wording for {@code d_lte}, and putting a second
     *              copy of that vocabulary in Java is how the two come to disagree.
     * @param left  what was actually read on the left, for the officer to see
     * @param right the same on the right; null for a unary operator
     * @param why   plain language — shown as the reason on a finding, so it is written for
     *              an examiner rather than as a debug string
     */
    public record RowResult(String id, String op, String label, Outcome outcome,
                            String left, String right, String why) {
    }

    /**
     * How the rule came out.
     *
     * @param rows every comparison, in the order the author wrote them
     */
    public record Result(Outcome outcome, List<RowResult> rows, String why) {

        public boolean failed() {
            return outcome == Outcome.FAIL;
        }

        /** The first row that failed, which is what a finding quotes. */
        public Optional<RowResult> firstFailure() {
            return rows.stream().filter(r -> r.outcome() == Outcome.FAIL).findFirst();
        }

        /** Index of that row, for {@code lc_finding.failed_row}. */
        public Integer failedRowIndex() {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).outcome() == Outcome.FAIL) return i;
            }
            return null;
        }

        /** Whether anything here needs an examiner rather than another comparison. */
        public boolean needsJudgement() {
            return rows.stream().anyMatch(r -> r.why() != null && r.why().startsWith(JUDGEMENT_PREFIX));
        }
    }

    static final String JUDGEMENT_PREFIX = "Needs an examiner: ";

    /**
     * Evaluates the whole tree.
     *
     * @param groups the {@code groups} array as the console stores it
     * @param facts  every fact on the case, looked up by (field key, document)
     */
    @SuppressWarnings("unchecked")
    public Result evaluate(Object groups, List<Fact> facts) {
        Map<String, Fact> index = index(facts);
        List<RowResult> all = new ArrayList<>();

        if (!(groups instanceof List<?> groupList) || groupList.isEmpty()) {
            return new Result(Outcome.INCONCLUSIVE, List.of(), "This check has no rule to run.");
        }

        // Group outcomes combine with the group's own connector. A single group is the
        // overwhelmingly common shape, so this stays simple rather than general: groups are
        // ANDed unless one says OR, which is what the console's connector means.
        Outcome combined = null;
        String connector = "AND";

        for (Object g : groupList) {
            if (!(g instanceof Map<?, ?> raw)) continue;
            Map<String, Object> group = (Map<String, Object>) raw;
            String logic = String.valueOf(group.getOrDefault("logic", "all")).toLowerCase();
            List<?> rows = group.get("rows") instanceof List<?> r ? r : List.of();

            List<RowResult> results = new ArrayList<>();
            for (Object row : rows) {
                if (row instanceof Map<?, ?> m) results.add(row((Map<String, Object>) m, index));
            }
            all.addAll(results);

            Outcome groupOutcome = combine(results, "any".equals(logic));
            combined = combined == null ? groupOutcome : merge(combined, groupOutcome, connector);
            connector = String.valueOf(group.getOrDefault("connector", "AND")).toUpperCase();
        }

        Outcome outcome = combined == null ? Outcome.INCONCLUSIVE : combined;
        return new Result(outcome, all, summary(outcome, all));
    }

    // --- One comparison -----------------------------------------------------

    private RowResult row(Map<String, Object> row, Map<String, Fact> index) {
        String id = String.valueOf(row.getOrDefault("id", ""));
        Operator op = Operator.of(String.valueOf(row.get("op")));
        Operand left = operand(row.get("l"), index);
        Operand right = operand(row.get("r"), index);
        String label = left.describe() + " " + op.wire() + (op.unary() ? "" : " " + right.describe());

        if (op == Operator.UNKNOWN) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, left.text(), right.text(),
                    "This comparison uses an operator the examination does not know.");
        }
        if (op.needsJudgement()) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, left.text(), right.text(),
                    JUDGEMENT_PREFIX + "\"" + op.wire() + "\" is a reading, not a comparison.");
        }

        // Presence is answerable even when the value is not — it is the question "did the
        // document say this at all", and the absence IS the answer.
        if (op == Operator.PRESENT) {
            return decide(id, op, label, left.present(), left, right,
                    left.present() ? null : left.describe() + " is not stated.");
        }
        if (op == Operator.ABSENT) {
            return decide(id, op, label, !left.present(), left, right,
                    left.present() ? left.describe() + " is stated: " + left.text() : null);
        }

        if (!left.present()) return missing(id, op, label, left, right, left);
        if (!right.present()) return missing(id, op, label, left, right, right);

        String tolerance = row.get("tol") == null ? "" : String.valueOf(row.get("tol"));
        return compare(id, label, op, left, right, tolerance);
    }

    private RowResult compare(String id, String label, Operator op,
                              Operand l, Operand r, String tolerance) {
        switch (op) {
            case EQ:       return decide(id, op, label, norm(l.text()).equals(norm(r.text())), l, r, differ(l, r));
            case NE:       return decide(id, op, label, !norm(l.text()).equals(norm(r.text())), l, r,
                                   "Both read " + l.text() + ".");
            case CONTAINS: return decide(id, op, label, norm(l.text()).contains(norm(r.text())), l, r,
                                   l.describe() + " does not contain " + r.text() + ".");
            case ONEOF:    return decide(id, op, label, oneOf(l.text(), r.text()), l, r,
                                   l.text() + " is not one of " + r.text() + ".");
            case MATCHES:  return regex(id, op, label, l, r, true);
            case NMATCHES: return regex(id, op, label, l, r, false);

            case N_EQ, LTE, GTE, WITHIN_PCT: {
                BigDecimal a = number(l.text());
                BigDecimal b = number(r.text());
                if (a == null || b == null) {
                    return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(),
                            "One of these is not a number: " + l.text() + " / " + r.text() + ".");
                }
                return switch (op) {
                    case N_EQ -> decide(id, op, label, a.compareTo(b) == 0, l, r,
                            l.text() + " is not " + r.text() + ".");
                    case LTE -> decide(id, op, label, a.compareTo(allowing(b, tolerance)) <= 0, l, r,
                            l.text() + " exceeds " + r.text()
                                    + (tolerance.isBlank() ? "" : " even allowing " + tolerance) + ".");
                    case GTE -> decide(id, op, label, a.compareTo(b) >= 0, l, r,
                            l.text() + " is less than " + r.text() + ".");
                    default -> decide(id, op, label, withinPercent(a, b, tolerance), l, r,
                            l.text() + " is outside the tolerance of " + r.text() + ".");
                };
            }

            case D_EQ, D_LTE, D_GTE, D_WITHIN: {
                LocalDate a = date(l.text());
                LocalDate b = date(r.text());
                if (a == null || b == null) {
                    return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(),
                            "One of these could not be read as a date: " + l.text() + " / " + r.text() + ".");
                }
                return switch (op) {
                    case D_EQ -> decide(id, op, label, a.equals(b), l, r,
                            l.text() + " is not the same date as " + r.text() + ".");
                    case D_LTE -> decide(id, op, label, !a.isAfter(b), l, r,
                            l.describe() + " " + a + " is after " + r.describe() + " " + b + ".");
                    case D_GTE -> decide(id, op, label, !a.isBefore(b), l, r,
                            l.describe() + " " + a + " is before " + r.describe() + " " + b + ".");
                    default -> {
                        Integer days = days(tolerance);
                        if (days == null) {
                            yield new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(),
                                    "This comparison needs a number of days, and none was given.");
                        }
                        long apart = Math.abs(ChronoUnit.DAYS.between(a, b));
                        yield decide(id, op, label, apart <= days, l, r,
                                a + " and " + b + " are " + apart + " days apart; the limit is " + days + ".");
                    }
                };
            }

            default:
                return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(),
                        "This comparison is not implemented.");
        }
    }

    // --- Operands -----------------------------------------------------------

    /** One side of a comparison, already resolved to what the documents said. */
    private record Operand(String field, String doc, String literal, String value, String label) {

        boolean present() {
            return value != null && !value.isBlank();
        }

        String text() {
            return value == null ? "" : value;
        }

        /** How it is named to an examiner: "Expiry date on the letter of credit". */
        String describe() {
            if (literal != null) return "\"" + literal + "\"";
            if (label == null) return field == null ? "?" : field;
            return doc == null ? label : label + " on " + doc;
        }

        boolean isLiteral() {
            return literal != null;
        }
    }

    @SuppressWarnings("unchecked")
    private Operand operand(Object side, Map<String, Fact> index) {
        if (!(side instanceof Map<?, ?> m)) return new Operand(null, null, null, null, null);
        Map<String, Object> o = (Map<String, Object>) m;

        Object literal = o.get("literal");
        if (literal != null && !String.valueOf(literal).isBlank()) {
            String text = String.valueOf(literal);
            return new Operand(null, null, text, text, null);
        }

        String field = o.get("field") == null ? null : String.valueOf(o.get("field"));
        String doc = o.get("doc") == null ? null : String.valueOf(o.get("doc"));
        if (field == null || doc == null) return new Operand(field, doc, null, null, null);

        Fact fact = index.get(key(field, doc));
        return new Operand(field, doc, null,
                fact == null ? null : fact.value(),
                fact == null ? field.replace('_', ' ') : fact.label());
    }

    private RowResult missing(String id, Operator op, String label, Operand l, Operand r, Operand absent) {
        // Named precisely, because "could not check" without a reason is what makes an
        // examination impossible to defend. Either the document was not presented, or it was
        // and this field was not found on it — different problems with different fixes.
        String why = absent.isLiteral()
                ? "This comparison is missing a value."
                : absent.describe() + " was not read. Either that document was not presented, "
                        + "or the field was not found on it.";
        return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(), why);
    }

    // --- Plumbing -----------------------------------------------------------

    private Map<String, Fact> index(List<Fact> facts) {
        Map<String, Fact> out = new LinkedHashMap<>();
        for (Fact f : facts) {
            if (f.fieldKey() == null) continue;
            // First wins: a document with two readings of one field keeps the earlier, the
            // same way the credit's tags do.
            out.putIfAbsent(key(f.fieldKey(), f.docCode()), f);
        }
        return out;
    }

    private String key(String field, String doc) {
        return doc + " " + field;
    }

    private RowResult decide(String id, Operator op, String label, boolean ok,
                             Operand l, Operand r, String whyNot) {
        return new RowResult(id, op.wire(), label, ok ? Outcome.PASS : Outcome.FAIL,
                l.text(), r.text(), ok ? null : whyNot);
    }

    private RowResult regex(String id, Operator op, String label, Operand l, Operand r, boolean expectMatch) {
        try {
            boolean matched = java.util.regex.Pattern.compile(r.text()).matcher(l.text()).find();
            return decide(id, op, label, matched == expectMatch, l, r,
                    expectMatch ? l.text() + " does not satisfy " + r.text() + "."
                                : l.text() + " satisfies " + r.text() + ", which it must not.");
        } catch (RuntimeException e) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l.text(), r.text(),
                    "The expression could not be read: " + r.text());
        }
    }

    /** All rows must pass, or any one, depending on how the author set the group. */
    private Outcome combine(List<RowResult> rows, boolean any) {
        if (rows.isEmpty()) return Outcome.INCONCLUSIVE;
        boolean anyPass = rows.stream().anyMatch(r -> r.outcome() == Outcome.PASS);
        boolean anyFail = rows.stream().anyMatch(r -> r.outcome() == Outcome.FAIL);
        boolean anyUnknown = rows.stream().anyMatch(r -> r.outcome() == Outcome.INCONCLUSIVE);

        if (any) {
            if (anyPass) return Outcome.PASS;
            return anyUnknown ? Outcome.INCONCLUSIVE : Outcome.FAIL;
        }
        // A failure stands even when another row could not be settled: one document that
        // contradicts the credit is a discrepancy whatever else was unreadable.
        if (anyFail) return Outcome.FAIL;
        return anyUnknown ? Outcome.INCONCLUSIVE : Outcome.PASS;
    }

    private Outcome merge(Outcome a, Outcome b, String connector) {
        if ("OR".equals(connector)) {
            if (a == Outcome.PASS || b == Outcome.PASS) return Outcome.PASS;
            return a == Outcome.INCONCLUSIVE || b == Outcome.INCONCLUSIVE
                    ? Outcome.INCONCLUSIVE : Outcome.FAIL;
        }
        if (a == Outcome.FAIL || b == Outcome.FAIL) return Outcome.FAIL;
        return a == Outcome.INCONCLUSIVE || b == Outcome.INCONCLUSIVE
                ? Outcome.INCONCLUSIVE : Outcome.PASS;
    }

    private String summary(Outcome outcome, List<RowResult> rows) {
        return switch (outcome) {
            case PASS -> null;
            case FAIL -> rows.stream().filter(r -> r.outcome() == Outcome.FAIL)
                    .map(RowResult::why).filter(java.util.Objects::nonNull)
                    .findFirst().orElse("The comparison did not hold.");
            case INCONCLUSIVE -> rows.stream().filter(r -> r.outcome() == Outcome.INCONCLUSIVE)
                    .map(RowResult::why).filter(java.util.Objects::nonNull)
                    .findFirst().orElse("This could not be settled from what was read.");
        };
    }

    private String differ(Operand l, Operand r) {
        return l.describe() + " reads " + l.text() + "; " + r.describe() + " reads " + r.text() + ".";
    }

    private boolean oneOf(String value, String list) {
        String v = norm(value);
        for (String candidate : list.split("[,;|/]")) {
            if (norm(candidate).equals(v)) return true;
        }
        return false;
    }

    /** Case and spacing are not a discrepancy. Anything more than that is a judgement. */
    private String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /**
     * A number, however the document wrote it.
     *
     * <p>Strips a currency code and thousands separators. <b>The comma is not always a
     * thousands separator</b> — SWIFT writes {@code USD60000,00} for sixty thousand — so a
     * comma with exactly two digits after it and no dot present is read as the decimal
     * point. Getting this backwards multiplies a credit by a hundred and every comparison
     * against it still looks like it worked.
     */
    private BigDecimal number(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[A-Za-z]", "").replaceAll("[^0-9,.\\-]", "").trim();
        if (s.isEmpty()) return null;
        if (!s.contains(".") && s.matches(".*,\\d{2}$")) {
            s = s.replace(".", "").replace(',', '.');
        } else {
            s = s.replace(",", "");
        }
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate date(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        try {
            return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** The ceiling a value may not exceed, once the author's tolerance is allowed for. */
    private BigDecimal allowing(BigDecimal limit, String tolerance) {
        BigDecimal pct = percent(tolerance);
        return pct == null ? limit
                : limit.add(limit.multiply(pct).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
    }

    private boolean withinPercent(BigDecimal a, BigDecimal b, String tolerance) {
        BigDecimal pct = percent(tolerance);
        if (pct == null || b.signum() == 0) return a.compareTo(b) == 0;
        BigDecimal allowed = b.multiply(pct).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
        return a.subtract(b).abs().compareTo(allowed) <= 0;
    }

    /**
     * A percentage out of what the author typed.
     *
     * <p>The tolerance box is free text — "10", "10%", "tolerance from 39A" — because it was
     * built for a person to read. A phrase that names no number yields none, and the
     * comparison is then made without one rather than with a guessed zero.
     */
    private BigDecimal percent(String tolerance) {
        if (tolerance == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(\\d+(?:[.,]\\d+)?)\\s*%?").matcher(tolerance);
        if (!m.find()) return null;
        try {
            return new BigDecimal(m.group(1).replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer days(String tolerance) {
        BigDecimal n = percent(tolerance);
        return n == null ? null : n.intValue();
    }
}
