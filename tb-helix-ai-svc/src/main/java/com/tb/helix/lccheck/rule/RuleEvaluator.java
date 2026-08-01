package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.types.ConditionFn;
import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.governance.types.Operator;

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

    public enum Outcome { PASS, FAIL, INCONCLUSIVE }

    /**
     * Why a row could not be settled — and it matters who has to act on it.
     *
     * <p>"The field was not available" is two entirely different situations wearing one
     * answer, and the difference decides whose problem it is:
     *
     * <ul>
     *   <li><b>NOT_PRESENTED</b> — the document is not in the bundle. Nothing was read
     *       because there was nothing to read, and that is a fact about the
     *       <em>presentation</em>: the beneficiary did not lodge it. It usually points at a
     *       missing-document discrepancy that another check raises properly.
     *   <li><b>NOT_EXTRACTED</b> — the document <em>is</em> there and we did not read the
     *       field off it. That is a fact about <em>us</em>. It is an extraction gap, it is
     *       fixable, and reporting it as though the documents were at fault hides the one
     *       signal that would get it fixed.
     *   <li><b>UNPARSEABLE</b> — something was read and could not be used as a date or a
     *       number. Both parties can see the value; nobody can compare it.
     * </ul>
     *
     * <p>All three still produce DOUBT, because a check that could not run has not passed.
     * What changes is what the officer is told to do about it — and, over a hundred cases,
     * whether "our reading is weak here" is visible at all.
     */
    public enum Gap { NOT_PRESENTED, NOT_EXTRACTED, UNPARSEABLE }

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
     * One side of a comparison, resolved.
     *
     * <p>Structured rather than rendered, and this is the whole difference between an exact
     * check the officer can read and one they have to take on trust. It used to be two
     * strings — the value, and a sentence with the field name and document folded into it —
     * so the workbench recovered the document by looking for {@code " on "} in an English
     * phrase. Which document a failed comparison points at is not something to parse out of
     * prose written for a person.
     *
     * @param resolved whether anything was actually read. False is not an error and not a
     *                 zero: it is the reason the row is INCONCLUSIVE, and the screen prints
     *                 "not extracted" where the value would go.
     */
    public record Side(String doc, String field, String label, String value,
                       boolean resolved, boolean literal) {

        String text() {
            return value == null ? "" : value;
        }

        /** How it is named to an examiner: "Expiry date on LC". */
        String describe() {
            if (literal) return "\"" + text() + "\"";
            if (label == null) return field == null ? "?" : field;
            return doc == null ? label : label + " on " + doc;
        }
    }

    /**
     * How one comparison came out.
     *
     * @param op    the operator as authored. Carried rather than phrased here: "is on or
     *              before" is {@link Operator#label()}, and putting a second copy of that
     *              vocabulary in Java is how the two come to disagree.
     * @param why   plain language — shown as the reason on a finding, so it is written for
     *              an examiner rather than as a debug string
     */
    public record RowResult(String id, String op, String label, Outcome outcome,
                            Side left, Side right, String tol, String why, Gap gap) {

        RowResult(String id, String op, String label, Outcome outcome,
                  Side left, Side right, String tol, String why) {
            this(id, op, label, outcome, left, right, tol, why, null);
        }
    }

    /**
     * How the rule came out.
     *
     * @param message the author's own Raise line — the wording that goes on the discrepancy.
     *                Null when none was written, and then {@link #why()} stands in.
     * @param rows    every comparison, in the order the author wrote them
     */
    public record Result(Outcome outcome, List<RowResult> rows, String why,
                         String scope, String message) {

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

        /**
         * Why this could not be settled, where it could not.
         *
         * <p>A missing document beats a missing field beats an unusable value. Not because
         * one is worse, but because a document that was never lodged explains every field it
         * would have carried — telling the officer three fields were unreadable when the
         * bill of lading simply is not there is three restatements of one fact.
         */
        public Gap gap() {
            for (Gap g : List.of(Gap.NOT_PRESENTED, Gap.NOT_EXTRACTED, Gap.UNPARSEABLE)) {
                if (rows.stream().anyMatch(r -> r.gap() == g)) return g;
            }
            return null;
        }

        /**
         * The engine's answer in the examination's own words.
         *
         * <p>The one translation between the two vocabularies, and it lives here so the two
         * stages that settle exact rules cannot disagree about it. They did: the run wrote a
         * finding for every outcome, and the threshold stage wrote one only when the rule
         * FAILED — so a gate that could not be settled left nothing on the case at all, and
         * a screen reading "no finding" showed it as clean. A threshold check reporting a
         * presentation it never managed to examine as clean is the worst answer this system
         * can give.
         *
         * <p>Three outcomes to three words, and no fourth: {@code NOT_RUN} is the case this
         * cannot express, because a Result exists only where something ran.
         */
        public String outcomeWord() {
            return switch (outcome) {
                case FAIL -> "DISCREPANT";
                case PASS -> "CLEAN";
                // Not CLEAN. A check that could not be run has not passed, and reporting it
                // as clean is how an examination comes to claim it looked at something it
                // did not.
                case INCONCLUSIVE -> "DOUBT";
            };
        }

        /** Why an absence is an absence, or null where this concluded. */
        public String reasonWord() {
            if (outcome != Outcome.INCONCLUSIVE) return null;
            Gap g = gap();
            return switch (g == null ? Gap.UNPARSEABLE : g) {
                case NOT_PRESENTED -> "NOT_PRESENTED";
                case NOT_EXTRACTED -> "NOT_EXTRACTED";
                case UNPARSEABLE -> "UNANSWERABLE";
            };
        }

        /** The row a finding quotes — the one that failed, or the first left unsettled. */
        public Optional<RowResult> firstUnsettled() {
            return firstFailure().or(() -> rows.stream()
                    .filter(r -> r.outcome() == Outcome.INCONCLUSIVE).findFirst());
        }

        /** The wording a discrepancy is raised under. */
        public String raise() {
            return message == null || message.isBlank() ? why : message;
        }
    }

    static final String JUDGEMENT_PREFIX = "Needs an examiner: ";

    /**
     * Evaluates a stored condition.
     *
     * @param rule  the {@code groups} array as it is stored, or the whole rule object
     * @param facts every fact on the case, looked up by (field key, document)
     */
    public Result evaluate(Object rule, List<Fact> facts, Set<String> presented) {
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
                    JUDGEMENT_PREFIX + "\"" + op.label() + "\" is a reading, not a comparison.");
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

            case N_EQ, LTE, GTE, WITHIN_PCT: {
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
                    default -> decide(id, op, label, withinPercent(a, b, tolerance), l, r, tolerance,
                            l.text() + " is outside the tolerance of " + r.text() + ".");
                };
            }

            case D_EQ, D_LTE, D_GTE, D_WITHIN: {
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
                got, false);
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

    /**
     * A date, however the document wrote it.
     *
     * <p>This accepted ISO and nothing else, on the reasonable assumption that extraction
     * normalises. It does not always: a bill of lading came back as {@code 20 – August –
     * 2010} — en dashes, spaces, a spelt-out month — and the comparison that decides whether
     * shipment was in time reported that it could not read a date it had been given. The
     * value was on the page, we had it in hand, and the check went unanswered on punctuation.
     *
     * <p><b>What it deliberately will not do is guess.</b> {@code 03/04/2010} is the third of
     * April to half the world and the fourth of March to the other half, and no examination
     * should pick one. An all-numeric ambiguous date yields nothing and the row stays
     * UNPARSEABLE, which is the honest answer — a wrong date here is a shipment declared late
     * that was not, or in time when it was not.
     */
    private LocalDate date(String raw) {
        if (raw == null) return null;
        // Dashes an author or a model might use where a hyphen was meant, and the separators
        // collapsed to one space so every pattern below sees the same shape.
        String s = raw.trim()
                .replace('\u2010', '-').replace('\u2011', '-').replace('\u2012', '-')
                .replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-')
                .replaceAll("[,]", " ")
                .replaceAll("\\s*-\\s*", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (s.isEmpty()) return null;

        // ISO first and unchanged — it is what extraction produces when it is working, and
        // it must not become slower or looser because the fallbacks exist.
        try {
            return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
        } catch (RuntimeException ignored) {
            // fall through to the written forms
        }

        for (java.time.format.DateTimeFormatter f : WRITTEN_DATES) {
            try {
                return LocalDate.parse(s, f);
            } catch (RuntimeException ignored) {
                // try the next
            }
        }
        return null;
    }

    /**
     * The unambiguous written forms, and only those.
     *
     * <p>Every one of these names its month in letters, which is what makes it safe: there is
     * no reading of "20 AUGUST 2010" that is not the twentieth of August. Nothing here parses
     * {@code dd/MM/yyyy} or {@code MM/dd/yyyy}, and nothing should — see {@link #date}.
     */
    private static final List<java.time.format.DateTimeFormatter> WRITTEN_DATES = List.of(
            written("d MMMM yyyy"), written("d MMM yyyy"),
            written("MMMM d yyyy"), written("MMM d yyyy"),
            written("yyyy MMMM d"), written("yyyy MMM d"),
            written("yyyy M d"));

    private static java.time.format.DateTimeFormatter written(String pattern) {
        return new java.time.format.DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern(pattern)
                .toFormatter(Locale.ENGLISH);
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
