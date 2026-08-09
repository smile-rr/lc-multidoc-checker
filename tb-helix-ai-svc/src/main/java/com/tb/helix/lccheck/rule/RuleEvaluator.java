package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.types.ConditionFn;
import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.governance.types.Operator;
import com.tb.helix.harness.expr.Values;

import com.tb.helix.lccheck.rule.Evidence.Fact;
import com.tb.helix.lccheck.rule.Evidence.Gap;
import com.tb.helix.lccheck.rule.Evidence.Outcome;
import com.tb.helix.lccheck.rule.Evidence.Result;
import com.tb.helix.lccheck.rule.Evidence.RowResult;
import com.tb.helix.lccheck.rule.Evidence.Side;

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
import java.util.Set;

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
 *
 * <p><b>The shape it walks is not its own.</b> {@link ConditionTree} owns that, so the
 * console, the compiler, the plan screen and this all read one definition of what a condition
 * is. What is left here is the arithmetic.
 */
@Component
public class RuleEvaluator {

    private final ExpressionEvaluator expressions;

    public RuleEvaluator(ExpressionEvaluator expressions) {
        this.expressions = expressions;
    }

    // The outcome, the gap, the fact and the rows are Evidence's — see that class for
    // why they are not this walker's. Imported by their plain names so the walk below
    // reads exactly as it did.


    /**
     * Evaluates a stored condition.
     *
     * @param rule  the {@code groups} array as it is stored, or the whole rule object
     * @param facts every fact on the case, looked up by (field key, document)
     */
    public Result evaluate(Object rule, List<Fact> facts, Set<String> presented) {
        return evaluate(rule, facts, presented, ExpressionEvaluator.Judged.none());
    }

    /**
     * @param judged what an examiner said about the conditions a comparison could not settle.
     *               Empty for a tree and for every table that never needed asking.
     */
    @SuppressWarnings("unchecked")
    public Result evaluate(Object rule, List<Fact> facts, Set<String> presented,
                           ExpressionEvaluator.Judged judged) {
        if (rule instanceof java.util.Map<?, ?> m
                && (m.get("when") != null || m.get("clauses") != null || m.get("source") != null)) {
            return expressions.evaluate((java.util.Map<String, Object>) m, facts, presented, judged);
        }
        return evaluate(rule, facts, presented);
    }

    private Result evaluateTree(Object rule, List<Fact> facts, Set<String> presented) {
        // The one place a check's language is decided, so that gate, execute, the finding,
        // the comparison view and the advice all stay unaware of which one it was written in.
        // A tree has groups; an expression has `when`, or `clauses` when it is graded.
        // Nothing else distinguishes them and nothing else needs to.
        if (rule instanceof java.util.Map<?, ?> m && (m.get("when") != null || m.get("clauses") != null)) {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> asMap = (java.util.Map<String, Object>) m;
            return expressions.evaluate(asMap, facts, presented);
        }
        ConditionTree.Parsed parsed = ConditionTree.parse(rule);
        if (!parsed.ok()) {
            return new Result(Outcome.INCONCLUSIVE, List.of(),
                    "This check has no rule to run: " + parsed.why(), null, null);
        }
        return evaluate(parsed.tree(), facts, presented);
    }

    /**
     * @param presented every document code this case actually holds. Without it an operand
     *                  that read nothing cannot say whether the document was missing or the
     *                  reading was — so it said "either, or", which is not an answer anybody
     *                  can act on. Empty means "we do not know", and the wording stays
     *                  cautious rather than blaming a presentation it cannot see.
     */
    public Result evaluate(ConditionTree tree, List<Fact> facts, Set<String> presented) {
        Map<String, Fact> index = index(facts);
        Set<String> have = presented == null ? Set.of() : presented;
        List<RowResult> all = new ArrayList<>();

        // Group outcomes combine with the group's own connector. A single group is the
        // overwhelmingly common shape, so this stays simple rather than general: groups are
        // ANDed unless one says OR, which is what the console's connector means.
        Outcome combined = null;
        String connector = "AND";

        for (ConditionTree.Group group : tree.groups()) {
            List<RowResult> results = new ArrayList<>();
            for (ConditionTree.Row row : group.rows()) {
                // One authored row can be several comparisons. "The beneficiary's name on
                // all documents" is one demand and as many rows as documents carry the
                // field, and the officer is shown the ones that were actually made.
                for (ConditionTree.Row actual : expand(row, index)) results.add(row(actual, index, have));
            }
            all.addAll(results);

            Outcome groupOutcome = combine(results, group.any());
            combined = combined == null ? groupOutcome : merge(combined, groupOutcome, connector);
            connector = group.connector();
        }

        Outcome outcome = combined == null ? Outcome.INCONCLUSIVE : combined;
        return new Result(outcome, all, summary(outcome, all), tree.scope(), tree.message());
    }

    // --- One comparison -----------------------------------------------------

    private RowResult row(ConditionTree.Row row, Map<String, Fact> index, Set<String> have) {
        Operator op = row.op();
        Side left = resolve(row.left(), index);
        Side right = resolve(row.right(), index);
        String label = left.describe() + " " + op.label() + (op.unary() ? "" : " " + right.describe());
        // Carried through AS WRITTEN, whether or not this operator reads it.
        //
        // This used to blank it where the operator ignores it — sixteen of the twenty — on
        // the reasoning that an inert note should not look like it applied. That was the
        // engine deleting what an author wrote, and it deleted the evidence of a real
        // mistake: the seeded cross-document check carried "corresponds, not identical" on
        // an `eq` row, which is the author describing `noconflict` in a box nothing reads.
        // Blanked, neither the officer nor Governance could ever see that the rule did not
        // do what its author believed.
        //
        // Whether it applied is `Operator.usesTol()`, and the screen says so. Reporting an
        // author's intent is this engine's job; deciding it was a mistake is not.
        String tol = row.tol();

        if (op == Operator.UNKNOWN) {
            return new RowResult(row.id(), op.wire(), label, Outcome.INCONCLUSIVE, left, right, tol,
                    "This comparison uses an operator the examination does not know.");
        }
        if (op.needsJudgement()) {
            // Asked deterministically first, and only ever answered one way. Two spellings
            // that reduce to the same characters are the same party and cannot conflict, and
            // most party comparisons in a presentation are exactly that — so most of these
            // rows settle here rather than costing a model call on every case for ever.
            //
            // A negative proves nothing and returns nothing: a trading name, a branch, a
            // transliteration all reduce apart and are all the same party. So the row falls
            // to an examiner, which is where it was going anyway.
            if (certainly(op, left, right)) {
                return decide(row.id(), op, label, true, left, right, tol, null);
            }
            return new RowResult(row.id(), op.wire(), label, Outcome.INCONCLUSIVE, left, right, tol,
                    Evidence.JUDGEMENT_PREFIX + "\"" + op.label() + "\" is a reading, not a comparison.");
        }

        // Presence is answerable even when the value is not — it is the question "did the
        // document say this at all", and the absence IS the answer.
        if (op == Operator.PRESENT) {
            return decide(row.id(), op, label, left.resolved(), left, right, tol,
                    left.resolved() ? null : left.describe() + " is not stated.");
        }
        if (op == Operator.ABSENT) {
            return decide(row.id(), op, label, !left.resolved(), left, right, tol,
                    left.resolved() ? left.describe() + " is stated: " + left.text() : null);
        }

        if (!left.resolved()) return missing(row.id(), op, label, left, right, tol, left, have);
        if (!right.resolved()) return missing(row.id(), op, label, left, right, tol, right, have);

        // Read, and not comparable. A field that came back with several values is stored as
        // the JSON of all of them in one cell, because the fact model has nowhere to put the
        // second — so comparing it finds a difference in our storage and reports it as a
        // difference in the documents. INCONCLUSIVE is the true answer and sends it to a
        // person; FAIL would be a discrepancy that does not exist, told confidently.
        //
        // After the presence operators deliberately: "is it stated" is answerable, and the
        // answer is yes. It is only the comparison that cannot be made.
        Side many = left.multi() ? left : right.multi() ? right : null;
        if (many != null) {
            return new RowResult(row.id(), op.wire(), label, Outcome.INCONCLUSIVE, left, right, tol,
                    many.describe() + " was read with more than one value, which cannot be "
                            + "compared as it stands: " + many.text(),
                    Gap.UNPARSEABLE);
        }

        return compare(row.id(), label, op, left, right, tol);
    }

    private RowResult compare(String id, String label, Operator op,
                              Side l, Side r, String tolerance) {
        switch (op) {
            case EQ:       return decide(id, op, label, norm(l.text()).equals(norm(r.text())), l, r, tolerance, differ(l, r));
            case NE:       return decide(id, op, label, !norm(l.text()).equals(norm(r.text())), l, r, tolerance,
                                   "Both read " + l.text() + ".");
            case CONTAINS: return decide(id, op, label, norm(l.text()).contains(norm(r.text())), l, r, tolerance,
                                   l.describe() + " does not contain " + r.text() + ".");
            case ONEOF:    return decide(id, op, label, oneOf(l.text(), r.text()), l, r, tolerance,
                                   l.text() + " is not one of " + r.text() + ".");
            case MATCHES:  return regex(id, op, label, l, r, tolerance, true);
            case NMATCHES: return regex(id, op, label, l, r, tolerance, false);

            case N_EQ, LTE, GTE, LT, GT, WITHIN_PCT: {
                BigDecimal a = number(l.text());
                BigDecimal b = number(r.text());
                if (a == null || b == null) {
                    return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tolerance,
                            "One of these is not a number: " + l.text() + " / " + r.text() + ".",
                            Gap.UNPARSEABLE);
                }
                return switch (op) {
                    case N_EQ -> decide(id, op, label, a.compareTo(b) == 0, l, r, tolerance,
                            l.text() + " is not " + r.text() + ".");
                    case LTE -> decide(id, op, label, a.compareTo(allowing(b, tolerance)) <= 0, l, r, tolerance,
                            l.text() + " exceeds " + r.text()
                                    + (tolerance.isBlank() ? "" : " even allowing " + tolerance) + ".");
                    case GTE -> decide(id, op, label, a.compareTo(b) >= 0, l, r, tolerance,
                            l.text() + " is less than " + r.text() + ".");
                    case LT -> decide(id, op, label, a.compareTo(b) < 0, l, r, tolerance,
                            l.text() + " is not less than " + r.text() + ".");
                    case GT -> decide(id, op, label, a.compareTo(b) > 0, l, r, tolerance,
                            l.text() + " is not more than " + r.text() + ".");
                    default -> decide(id, op, label, withinPercent(a, b, tolerance), l, r, tolerance,
                            l.text() + " is outside the tolerance of " + r.text() + ".");
                };
            }

            case D_EQ, D_LTE, D_GTE, D_LT, D_GT, D_WITHIN: {
                LocalDate a = date(l.text());
                LocalDate b = date(r.text());
                if (a == null || b == null) {
                    return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tolerance,
                            "One of these could not be read as a date: " + l.text() + " / " + r.text() + ".",
                            Gap.UNPARSEABLE);
                }
                return switch (op) {
                    case D_EQ -> decide(id, op, label, a.equals(b), l, r, tolerance,
                            l.text() + " is not the same date as " + r.text() + ".");
                    case D_LTE -> decide(id, op, label, !a.isAfter(b), l, r, tolerance,
                            l.describe() + " " + a + " is after " + r.describe() + " " + b + ".");
                    case D_GTE -> decide(id, op, label, !a.isBefore(b), l, r, tolerance,
                            l.describe() + " " + a + " is before " + r.describe() + " " + b + ".");
                    case D_LT -> decide(id, op, label, a.isBefore(b), l, r, tolerance,
                            l.describe() + " " + a + " is not before " + r.describe() + " " + b + ".");
                    case D_GT -> decide(id, op, label, a.isAfter(b), l, r, tolerance,
                            l.describe() + " " + a + " is not after " + r.describe() + " " + b + ".");
                    default -> {
                        Integer days = days(tolerance);
                        if (days == null) {
                            yield new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tolerance,
                                    "This comparison needs a number of days, and none was given.");
                        }
                        long apart = Math.abs(ChronoUnit.DAYS.between(a, b));
                        yield decide(id, op, label, apart <= days, l, r, tolerance,
                                a + " and " + b + " are " + apart + " days apart; the limit is " + days + ".");
                    }
                };
            }

            default:
                return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tolerance,
                        "This comparison is not implemented.");
        }
    }

    /**
     * A row that could not be settled because a side read nothing.
     *
     * <p>It used to say "Either that document was not presented, or the field was not found
     * on it" — an honest sentence about an unanswered question, and useless to the person
     * reading it, because the two halves are different problems with different owners. One
     * is the beneficiary's, one is ours, and an examination that cannot tell them apart
     * cannot report either.
     *
     * <p>It could not tell them apart because nothing handed it the list of documents on the
     * case. Now something does.
     */
    private RowResult missing(String id, Operator op, String label, Side l, Side r,
                              String tol, Side absent, Set<String> have) {
        if (absent.literal() || absent.field() == null) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
                    "This comparison is missing a value.", Gap.UNPARSEABLE);
        }

        String doc = absent.doc();
        String field = absent.label() == null ? absent.field() : absent.label();

        // A computed operand read nothing because one of ITS operands did. The row that
        // matters is the one underneath, and it is already reported on its own terms; saying
        // "date_plus(…) was not read" on top of it explains nothing.
        if (COMPUTED.equals(doc)) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
                    field + " could not be worked out, because something it reads was not read.",
                    Gap.NOT_EXTRACTED);
        }

        // Cautious when nothing said what is on the case: we do not know, so we do not blame.
        if (have.isEmpty()) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
                    absent.describe() + " was not read.", Gap.NOT_EXTRACTED);
        }

        if (!have.contains(doc)) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
                    "No " + doc + " was presented, so " + field.toLowerCase(Locale.ROOT)
                            + " could not be read.", Gap.NOT_PRESENTED);
        }
        return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
                doc + " was presented, but " + field.toLowerCase(Locale.ROOT)
                        + " was not read from it.", Gap.NOT_EXTRACTED);
    }

    /**
     * Whether a judgement operator can be settled without one.
     *
     * <p>{@code addr_same_country} is absent on purpose: deciding that two addresses name one
     * country is the whole question, and a string comparison that agreed only when the
     * addresses were typed identically would settle nothing and imply it had.
     */
    private boolean certainly(Operator op, Side l, Side r) {
        if (!l.resolved() || !r.resolved()) return false;
        return switch (op) {
            case SAME_PARTY -> PartyNames.certainlySame(l.text(), r.text());
            case NOCONFLICT, SAME_COUNTRY -> PartyNames.certainlyIdentical(l.text(), r.text());
            default -> false;
        };
    }

    // --- Operands -----------------------------------------------------------

    /** The document a computed operand is filed under, since it is read off none. */
    private static final String COMPUTED = "computed";

    private Side resolve(ConditionTree.Operand o, Map<String, Fact> index) {
        if (o.isLiteral()) {
            return new Side(null, null, null, o.literal(), true, true);
        }
        if (o.isComputed()) {
            return compute(o, index);
        }
        if (!o.names()) {
            return new Side(o.doc(), o.field(), null, null, false, false);
        }
        Fact fact = index.get(key(o.field(), o.doc()));
        boolean got = fact != null && fact.value() != null && !fact.value().isBlank();
        return new Side(o.doc(), o.field(),
                // The dictionary's label where there is a reading to take it from, the field
                // key made readable where there is not — and capitalised either way, because
                // this is the subject of sentences shown to an officer and "presentation date
                // on CS was not read" reads like a fragment somebody forgot to finish.
                fact == null ? sentenceCase(o.field().replace('_', ' ')) : fact.label(),
                fact == null ? null : fact.value(),
                got, false, fact != null && fact.multiValued());
    }

    /**
     * A value the condition works out rather than reads.
     *
     * <p>Nothing here guesses. An argument that did not resolve, a date that will not parse,
     * a number that is not one — each yields an unresolved side, and a comparison against an
     * unresolved side is INCONCLUSIVE. Twenty-one days after an on-board date nobody could
     * read is not day twenty-one of the epoch.
     */
    private Side compute(ConditionTree.Operand o, Map<String, Fact> index) {
        List<Side> args = o.args().stream().map(a -> resolve(a, index)).toList();
        String label = o.fn().wire() + "(" + String.join(", ",
                args.stream().map(a -> a.label() == null ? a.text() : a.label()).toList()) + ")";

        if (!o.fn().accepts(args.size()) || args.stream().anyMatch(a -> !a.resolved())) {
            return new Side(COMPUTED, o.fn().wire(), label, null, false, false);
        }
        String value = apply(o.fn(), args);
        return new Side(COMPUTED, o.fn().wire(), label, value, value != null, false);
    }

    private String apply(ConditionFn fn, List<Side> args) {
        return switch (fn) {
            case DATE_PLUS -> shift(args, 1);
            case DATE_MINUS -> shift(args, -1);
            case DAYS_BETWEEN -> {
                LocalDate a = date(args.get(0).text());
                LocalDate b = date(args.get(1).text());
                yield a == null || b == null ? null
                        : String.valueOf(Math.abs(ChronoUnit.DAYS.between(a, b)));
            }
            case PCT_OF -> {
                BigDecimal a = number(args.get(0).text());
                BigDecimal b = number(args.get(1).text());
                yield a == null || b == null ? null
                        : plain(a.multiply(b).divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
            }
            case SUM_OF -> {
                BigDecimal total = BigDecimal.ZERO;
                for (Side s : args) {
                    BigDecimal n = number(s.text());
                    if (n == null) yield null;
                    total = total.add(n);
                }
                yield plain(total);
            }
            case PRODUCT_OF -> {
                BigDecimal a = number(args.get(0).text());
                BigDecimal b = number(args.get(1).text());
                yield a == null || b == null ? null : plain(a.multiply(b));
            }
            case NUM_OF -> {
                BigDecimal a = number(args.get(0).text());
                yield a == null ? null : plain(a);
            }
            case PARTY_OF -> {
                String p = PartyNames.normalise(args.get(0).text());
                yield p.isEmpty() ? null : p;
            }
        };
    }

    private String shift(List<Side> args, int sign) {
        LocalDate base = date(args.get(0).text());
        BigDecimal days = number(args.get(1).text());
        return base == null || days == null ? null
                : base.plusDays(sign * days.longValue()).toString();
    }

    /** Without a trailing run of zeroes, so a comparison prints "21" and not "21.0000". */
    private String plain(BigDecimal n) {
        return n.stripTrailingZeros().toPlainString();
    }

    // --- Expansion ----------------------------------------------------------

    /**
     * One authored row, as the comparisons it actually stands for.
     *
     * <p>A row naming {@link ConditionTree#ANY_DOCUMENT} is one demand over however many
     * documents carry the field — "the beneficiary's name on all documents to agree with
     * field 59". Expanded here rather than when the rule is written, because which documents
     * were presented is a fact about the case and not about the rule.
     *
     * <p><b>A wildcard that matches nothing stays one row</b>, so it resolves to INCONCLUSIVE
     * and says so. Expanding it to no rows would remove the demand from the check, and a
     * check with one fewer row than it was authored with passes more easily than it should.
     */
    private List<ConditionTree.Row> expand(ConditionTree.Row row, Map<String, Fact> index) {
        ConditionTree.Operand left = row.left();
        ConditionTree.Operand right = row.right();
        boolean onLeft = left.wildcard();
        boolean onRight = right.wildcard();
        if (!onLeft && !onRight) return List.of(row);

        // Only one side may range. Two would be a cross product nobody authored and nobody
        // could read, so the left is taken and the right is left as written.
        ConditionTree.Operand ranging = onLeft ? left : right;
        List<String> docs = documentsCarrying(ranging.field(), index);
        if (docs.isEmpty()) return List.of(row);

        List<ConditionTree.Row> out = new ArrayList<>();
        for (String doc : docs) {
            ConditionTree.Operand bound = ConditionTree.Operand.field(doc, ranging.field());
            out.add(new ConditionTree.Row(
                    // Suffixed rather than repeated: two rows sharing an id are two rows the
                    // officer cannot tell apart on a finding.
                    row.id() + "@" + doc,
                    row.op(),
                    onLeft ? bound : left,
                    onLeft ? right : bound,
                    row.tol()));
        }
        return out;
    }

    /** Every document this case has a reading of one field on, in fact order. */
    private List<String> documentsCarrying(String field, Map<String, Fact> index) {
        List<String> out = new ArrayList<>();
        if (field == null) return out;
        for (Fact f : index.values()) {
            if (field.equals(f.fieldKey()) && f.value() != null && !f.value().isBlank()
                    && !out.contains(f.docCode())) {
                out.add(f.docCode());
            }
        }
        return out;
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

    private static String sentenceCase(String s) {
        return s == null || s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String key(String field, String doc) {
        return doc + " " + field;
    }

    private RowResult decide(String id, Operator op, String label, boolean ok,
                             Side l, Side r, String tol, String whyNot) {
        return new RowResult(id, op.wire(), label, ok ? Outcome.PASS : Outcome.FAIL,
                l, r, tol, ok ? null : whyNot);
    }

    private RowResult regex(String id, Operator op, String label, Side l, Side r,
                            String tol, boolean expectMatch) {
        try {
            boolean matched = java.util.regex.Pattern.compile(r.text()).matcher(l.text()).find();
            return decide(id, op, label, matched == expectMatch, l, r, tol,
                    expectMatch ? l.text() + " does not satisfy " + r.text() + "."
                                : l.text() + " satisfies " + r.text() + ", which it must not.");
        } catch (RuntimeException e) {
            return new RowResult(id, op.wire(), label, Outcome.INCONCLUSIVE, l, r, tol,
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

    private String differ(Side l, Side r) {
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

    // Both of these moved to `Values`, which the expression engine's caller needs too: a
    // fact is a string in a column and a comparison of dates is not, so whoever binds a
    // value has to read it the same way this does. Two readings of USD60000,00 is one of
    // them multiplying a credit by a hundred.
    private BigDecimal number(String raw) {
        return Values.number(raw);
    }

    private LocalDate date(String raw) {
        return Values.date(raw);
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
