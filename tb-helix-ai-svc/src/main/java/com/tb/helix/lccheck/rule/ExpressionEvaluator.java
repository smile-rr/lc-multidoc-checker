package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.spi.ExpressionRules;
import com.tb.helix.governance.types.ExpressionRule;
import com.tb.helix.governance.types.Operator;
import com.tb.helix.harness.expr.ExprResult;
import com.tb.helix.harness.expr.Values;
import com.tb.helix.harness.expr.ExpressionEngine;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Settling an expression against what the documents said.
 *
 * <p>Three things happen here and none of them is arithmetic — that is the engine's. This
 * resolves {@code {BOL.on_board_date}} to a value, decides what <em>kind</em> of value it is,
 * and turns the answer back into the shape every screen already reads.
 *
 * <p><b>Typing is the point.</b> A fact is a string in a column; a comparison of dates is not.
 * The dictionary says which fields are dates and which are amounts, so a date arrives at the
 * engine as a {@code LocalDate} and Spring's own comparator orders it, and an amount arrives
 * as a {@code BigDecimal} so money is added exactly rather than as a double. Handing over
 * strings would have {@code "2025-4-9" > "2025-04-18"} come back true, which is the sort of
 * wrong that looks right.
 *
 * <p><b>What is not read is never bound.</b> That is the same rule the engine states and it is
 * enforced on both sides on purpose: a name with no fact, or one whose fact holds several
 * values in one cell, is simply absent from the map, and every comparison reading it is
 * unknown rather than false.
 *
 * <p>The answer is a {@link RuleEvaluator.Result}, the same record the tree language produces,
 * so the finding, the comparison view, the review screen and the refusal advice need to know
 * nothing about which language a check was written in.
 */
@Component
public class ExpressionEvaluator {

    private final ExpressionEngine engine;
    private final ExpressionRules rules;

    public ExpressionEvaluator(ExpressionEngine engine, ExpressionRules rules) {
        this.engine = engine;
        this.rules = rules;
    }

    /**
     * @param rule      the stored condition — one, or a graded ladder of them
     * @param presented which documents the bundle actually holds, so a value that is missing
     *                  can say whose problem it is
     */
    public RuleEvaluator.Result evaluate(Map<String, Object> rule, List<RuleEvaluator.Fact> facts,
                                         Set<String> presented) {
        return evaluate(rule, facts, presented, Judged.none());
    }

    /**
     * What an examiner said about the conditions a comparison could not settle.
     *
     * <p>Supplied by the caller because asking costs money and deciding whether to spend it is
     * the stage's business, not this one's. Absent — which is every expression check and every
     * agent check whose questions were never reached — a question is simply unanswered, and an
     * unanswered condition stops the table at doubt.
     *
     * @param answer  by branch index
     * @param because by branch index, one sentence for the evidence row
     */
    public record Judged(Map<Integer, ExpressionRule.Answer> answer, Map<Integer, String> because) {

        public static Judged none() {
            return new Judged(Map.of(), Map.of());
        }

        ExpressionRule.Answer of(int branch) {
            return answer.getOrDefault(branch, ExpressionRule.Answer.UNKNOWN);
        }
    }

    public RuleEvaluator.Result evaluate(Map<String, Object> rule, List<RuleEvaluator.Fact> facts,
                                         Set<String> presented, Judged judged) {
        ExpressionRule graded = ExpressionRule.of(rule);
        if (graded == null) {
            return new RuleEvaluator.Result(RuleEvaluator.Outcome.INCONCLUSIVE, List.of(),
                    "This check has no condition to run.", str(rule.get("scope")),
                    str(rule.get("message")));
        }
        return walk(graded, index(facts), presented, str(rule.get("message")), judged);
    }

    /**
     * The table, first match wins.
     *
     * <p>Every branch actually evaluated contributes its rows, because together they are the
     * working: an officer looking at a doubtful expiry needs to see which branch was tried
     * and what it compared, or the verdict is a bare assertion. Branches below the one that
     * decided contribute nothing — they were never run, and a row for a comparison nobody
     * made is the kind of evidence that gets a refusal overturned.
     *
     * @see ExpressionRule for the syntax, and for why an unanswerable branch stops the table
     *      rather than falling through to the next line
     */
    private RuleEvaluator.Result walk(ExpressionRule rule, Map<String, RuleEvaluator.Fact> byName,
                                      Set<String> presented, String message, Judged judged) {
        List<RuleEvaluator.RowResult> rows = new ArrayList<>();
        List<String> readings = new ArrayList<>();
        String[] broken = new String[1];

        ExpressionRule.Decision decision = rule.decide(i -> {
            ExpressionRule.Branch branch = rule.branches().get(i);

            // A question is settled by whoever was asked, and its row is the question itself.
            // Rendered like any comparison, so one evidence view serves both kinds and an
            // officer reads what was asked beside what came back.
            if (branch.judged()) {
                ExpressionRule.Answer said = judged.of(i);
                rows.add(RuleEvaluator.RowResult.judged(
                        rule.branches().size() > 1 ? "q" + i : "q",
                        branch.ask(), outcome(said), judged.because().get(i)));
                readings.add(branch.ask());
                return said;
            }

            var program = engine.compile(branch.when() == null ? "" : branch.when());
            if (!program.ok()) {
                // Refused at authoring and refused again here, because a field can be unbound
                // after a check is written. Never a match and never a failure: a condition
                // that cannot be read has not been contradicted by the documents.
                broken[0] = program.why();
                return ExpressionRule.Answer.UNKNOWN;
            }

            Map<String, Object> values = new LinkedHashMap<>();
            for (String name : program.names()) {
                Object typed = valueOf(name, byName);
                if (typed != null) values.put(name, typed);
            }

            ExprResult answer = engine.run(branch.when(), values);
            rows.addAll(rows(answer, byName, presented, i, rule.branches().size()));
            readings.add(answer.reading());
            return switch (answer.verdict()) {
                case TRUE -> ExpressionRule.Answer.TRUE;
                case FALSE -> ExpressionRule.Answer.FALSE;
                case UNKNOWN -> ExpressionRule.Answer.UNKNOWN;
            };
        });

        String why = broken[0] != null
                ? "This condition could not be read: " + broken[0]
                : String.join("  —  ", readings);

        // A DOUBT the table CHOSE is not a DOUBT about our reading, and the rows have to say
        // which: HUMAN_ONLY rather than a gap, because everything was read and every
        // comparison was made. Reported as "unanswerable" it would look like an extraction
        // failure and put a working field on a list of things to fix.
        boolean chosen = decision.verdict() == ExpressionRule.Verdict.DOUBT
                && !decision.unsettled();
        return new RuleEvaluator.Result(
                switch (decision.verdict()) {
                    case CLEAN -> RuleEvaluator.Outcome.PASS;
                    case DISCREPANT -> RuleEvaluator.Outcome.FAIL;
                    case DOUBT -> RuleEvaluator.Outcome.INCONCLUSIVE;
                },
                chosen ? humanOnly(rows) : rows,
                why, rule.scope(), message);
    }

    /**
     * Which questions this table still needs answered, before anything is asked.
     *
     * <p>Every comparison is settled here, for free. A branch that matches ends it and nothing
     * is asked at all — so a table whose cheap deterministic case comes first costs nothing on
     * the presentations it covers, and a table is never billed for a line the examination
     * would not have reached.
     */
    public List<Integer> pending(Map<String, Object> rule, List<RuleEvaluator.Fact> facts) {
        ExpressionRule table = ExpressionRule.of(rule);
        if (table == null || !table.judged()) return List.of();

        Map<String, RuleEvaluator.Fact> byName = index(facts);
        return table.pending(i -> {
            ExpressionRule.Branch branch = table.branches().get(i);
            var program = engine.compile(branch.when() == null ? "" : branch.when());
            if (!program.ok()) return ExpressionRule.Answer.UNKNOWN;
            Map<String, Object> values = new LinkedHashMap<>();
            for (String name : program.names()) {
                Object typed = valueOf(name, byName);
                if (typed != null) values.put(name, typed);
            }
            return switch (engine.run(branch.when(), values).verdict()) {
                case TRUE -> ExpressionRule.Answer.TRUE;
                case FALSE -> ExpressionRule.Answer.FALSE;
                case UNKNOWN -> ExpressionRule.Answer.UNKNOWN;
            };
        });
    }

    /** Only where nothing was missing — a real gap is the more actionable thing to report. */
    private static List<RuleEvaluator.RowResult> humanOnly(List<RuleEvaluator.RowResult> rows) {
        if (rows.stream().anyMatch(r -> r.gap() != null)) return rows;
        List<RuleEvaluator.RowResult> out = new ArrayList<>();
        for (RuleEvaluator.RowResult r : rows) out.add(r.withGap(RuleEvaluator.Gap.HUMAN_ONLY));
        return out;
    }

    // =========================================================================
    // Facts to values
    // =========================================================================

    private static Map<String, RuleEvaluator.Fact> index(List<RuleEvaluator.Fact> facts) {
        Map<String, RuleEvaluator.Fact> out = new LinkedHashMap<>();
        for (RuleEvaluator.Fact f : facts) {
            if (f.fieldKey() == null || f.docCode() == null) continue;
            out.putIfAbsent(f.docCode() + "." + f.fieldKey(), f);
        }
        return out;
    }

    /**
     * One name, as the kind of thing the dictionary says it is.
     *
     * @return null when there is nothing to bind — no fact, a blank one, one holding several
     *         values in a single cell, or a value that will not read as the type it is
     *         declared to be. All four are <em>unknown</em>, and the difference between them
     *         is reported on the row rather than guessed at here.
     */
    private Object valueOf(String name, Map<String, RuleEvaluator.Fact> byName) {
        RuleEvaluator.Fact fact = byName.get(name);
        if (fact == null || fact.value() == null || fact.value().isBlank()) return null;
        // A field read with more than one value is stored as the JSON of all of them in one
        // cell, and comparing that finds a difference in our storage rather than in the
        // documents. Withheld here for the same reason the tree evaluator refuses it.
        if (fact.multiValued()) return null;

        // Read as the dictionary's kind, through the rulebook rather than here. The
        // console binds the same names from typed-in values and must get the same reading,
        // and it is on the other side of a module boundary — so a copy of this switch was a
        // copy that disagreed.
        return rules.read(name, fact.value());
    }

    // =========================================================================
    // The answer, in the shape every screen already reads
    // =========================================================================

    private static RuleEvaluator.Outcome outcome(ExpressionRule.Answer a) {
        return switch (a) {
            case TRUE -> RuleEvaluator.Outcome.PASS;
            case FALSE -> RuleEvaluator.Outcome.FAIL;
            case UNKNOWN -> RuleEvaluator.Outcome.INCONCLUSIVE;
        };
    }

    private static RuleEvaluator.Outcome outcome(ExprResult.Verdict v) {
        return switch (v) {
            case TRUE -> RuleEvaluator.Outcome.PASS;
            case FALSE -> RuleEvaluator.Outcome.FAIL;
            case UNKNOWN -> RuleEvaluator.Outcome.INCONCLUSIVE;
        };
    }

    /**
     * @param clause which rung these came from, and {@code rungs} how many there are — the row
     *               id has to stay unique across the whole ladder, because it is what a screen
     *               keys a row by and two rungs both calling their first comparison {@code e0}
     *               is how one of them stops rendering.
     */
    private List<RuleEvaluator.RowResult> rows(ExprResult answer,
                                               Map<String, RuleEvaluator.Fact> byName,
                                               Set<String> presented, int clause, int rungs) {
        List<RuleEvaluator.RowResult> out = new ArrayList<>();
        for (ExprResult.LeafResult leaf : answer.leaves()) {
            List<ExprResult.Operand> ops = leaf.operands();
            RuleEvaluator.Side left = side(ops.isEmpty() ? null : ops.get(0), byName);
            RuleEvaluator.Side right = side(ops.size() > 1 ? ops.get(1) : null, byName);
            Operator op = operatorFor(leaf.op());
            String id = rungs > 1 ? "c" + clause + "e" + leaf.index() : "e" + leaf.index();
            out.add(new RuleEvaluator.RowResult(
                    id, op.wire(), leaf.source(), outcome(leaf.outcome()),
                    left, right, null, leaf.why(), gap(leaf, presented)));
        }
        return out;
    }

    private static RuleEvaluator.Side side(ExprResult.Operand o,
                                           Map<String, RuleEvaluator.Fact> byName) {
        if (o == null) return new RuleEvaluator.Side(null, null, null, null, false, false);
        int dot = o.name().indexOf('.');
        String doc = dot > 0 ? o.name().substring(0, dot) : null;
        String field = dot > 0 ? o.name().substring(dot + 1) : o.name();
        RuleEvaluator.Fact fact = byName.get(o.name());
        return new RuleEvaluator.Side(doc, field,
                fact != null ? fact.label() : field,
                Values.show(o.value()),
                o.resolved(), false, fact != null && fact.multiValued());
    }

    /**
     * Whose problem the missing value is — the presentation's, or ours.
     *
     * <p>The same distinction the tree evaluator draws, and it is the only signal that ever
     * gets an extraction gap fixed: a document nobody lodged is the beneficiary's omission,
     * while a document that is there and a field we did not read off it is ours.
     */
    private static RuleEvaluator.Gap gap(ExprResult.LeafResult leaf, Set<String> presented) {
        if (leaf.outcome() != ExprResult.Verdict.UNKNOWN) return null;
        for (ExprResult.Operand o : leaf.operands()) {
            if (o.resolved()) continue;
            int dot = o.name().indexOf('.');
            String doc = dot > 0 ? o.name().substring(0, dot) : null;
            if (doc != null && !presented.isEmpty() && !presented.contains(doc)) {
                return RuleEvaluator.Gap.NOT_PRESENTED;
            }
            return RuleEvaluator.Gap.NOT_EXTRACTED;
        }
        // Everything was read and it still could not be settled — a value that would not
        // parse, or a verb that could not use what it was given.
        return RuleEvaluator.Gap.UNPARSEABLE;
    }

    /**
     * The expression's comparison, named in the one vocabulary every screen already reads.
     *
     * <p>Mapped rather than invented so a finding written from an expression renders through
     * the same {@code ComparisonView} a tree's does. A second set of operator names on the
     * wire would mean the browser learning which language produced a row before it could
     * label it, which is exactly the sort of thing the console should never have to know.
     */
    private static Operator operatorFor(String op) {
        return switch (op) {
            case ">" -> Operator.GT;
            case "<" -> Operator.LT;
            case ">=" -> Operator.GTE;
            case "<=" -> Operator.LTE;
            case "==" -> Operator.N_EQ;
            case "!=" -> Operator.NE;
            case "same" -> Operator.EQ;
            case "differs" -> Operator.NE;
            case "contains" -> Operator.CONTAINS;
            case "oneOf" -> Operator.ONEOF;
            case "matches" -> Operator.MATCHES;
            case "notMatches" -> Operator.NMATCHES;
            case "present" -> Operator.PRESENT;
            case "absent" -> Operator.ABSENT;
            case "atMost" -> Operator.LTE;
            case "withinPct" -> Operator.WITHIN_PCT;
            case "withinDays" -> Operator.D_WITHIN;
            case "sameParty" -> Operator.SAME_PARTY;
            case "noConflict" -> Operator.NOCONFLICT;
            case "sameCountry" -> Operator.SAME_COUNTRY;
            case "addrSameCountry" -> Operator.ADDR_SAME_COUNTRY;
            // A verb the engine has and this mapping does not. The row still renders — its
            // own source says what it compared — and it is never guessed at as something else.
            default -> Operator.UNKNOWN;
        };
    }

    private static String str(Object o) {
        return o == null || String.valueOf(o).isBlank() ? null : String.valueOf(o);
    }
}
