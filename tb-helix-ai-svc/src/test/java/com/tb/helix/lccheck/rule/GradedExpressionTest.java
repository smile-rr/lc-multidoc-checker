package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.expression.DictionaryExpressionCompiler;
import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.types.ExpressionRule;
import com.tb.helix.harness.expr.SpelExpressionEngine;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The seeded expiry check, and the table mechanism underneath it.
 *
 * <p><b>Expiry is not a matter of degree.</b> UCP 600 art. 6(d)(i) requires presentation on or
 * before the expiry date, and art. 6(d)(ii) makes the place for presentation that of the bank
 * with which the credit is available — so the covering schedule's date <em>is</em> the counter
 * date, and there is no transit to allow for. This check carried a five-day allowance for a
 * while, on a reading of {@code presentation_date} the dictionary flatly contradicts, and it
 * reported a credit that had plainly expired as a doubt.
 *
 * <p>The one thing that can overturn a failure here is art. 29(a) — an expiry falling on a day
 * the bank is closed rolls to the next banking day — and it is deliberately NOT modelled: we
 * hold no banking calendar for the place of presentation, and a rule that guessed at one would
 * be wrong silently. It is on the check's own note for the officer instead.
 *
 * <p>What the rest of this tests is that the two DOUBTs stay apart. "A person must settle
 * this" and "we did not read the field" are the same word on the same screen, and only one of
 * them is a reason to go and fix an extractor.
 */
class GradedExpressionTest {

    private static final SpelExpressionEngine ENGINE = new SpelExpressionEngine(List.of());

    private final ExpressionEvaluator evaluator = new ExpressionEvaluator(
            ENGINE, new DictionaryExpressionCompiler(new StubCatalogue(), ENGINE));

    /** The seeded E0001, verbatim. */
    private static final Map<String, Object> EXPIRY = Map.of(
            "v", 3,
            "scope", "Every presentation",
            "source", """
                    WHEN {CS.presentation_date} <= {LC.expiry_date}  THEN "clean"
                    ELSE "discrepancy"
                    """);

    private Evidence.Result run(String presented, String expiry, String availableWith) {
        Map<String, String> given = new LinkedHashMap<>();
        given.put("CS.presentation_date", presented);
        given.put("LC.expiry_date", expiry);
        given.put("LC.available_with", availableWith);

        List<Evidence.Fact> facts = given.entrySet().stream()
                .filter(e -> e.getValue() != null)
                .map(e -> {
                    int dot = e.getKey().indexOf('.');
                    String doc = e.getKey().substring(0, dot);
                    String field = e.getKey().substring(dot + 1);
                    return new Evidence.Fact(field, doc, field, e.getValue());
                })
                .toList();
        return evaluator.evaluate(EXPIRY, facts, Set.of("LC", "CS"));
    }

    @Nested
    @DisplayName("expiry, which is not a matter of degree")
    class Expiry {

        @Test
        @DisplayName("before the expiry date is clean")
        void inTime() {
            Evidence.Result r = run("20250417", "20250418", "BY NEGOTIATION");
            assertThat(r.outcomeWord()).isEqualTo("CLEAN");
            // One branch matched, so only its comparison is evidence.
            assertThat(r.rows()).hasSize(1);
        }

        @Test
        @DisplayName("ON the expiry date is still in time")
        void onTheDay() {
            assertThat(run("20250418", "20250418", "BY NEGOTIATION").outcomeWord())
                    .isEqualTo("CLEAN");
        }

        @Test
        @DisplayName("one day past expiry is a discrepancy, not a doubt")
        void oneDayPast() {
            // The covering schedule's date IS the counter date (art. 6(d)(ii)), so there is
            // no transit to allow for and nothing here for a person to weigh. Reported as a
            // doubt this sends an expired credit to an officer as an open question.
            assertThat(run("20250419", "20250418", "BY NEGOTIATION").outcomeWord())
                    .isEqualTo("DISCREPANT");
        }

        @Test
        @DisplayName("how the credit is available does not bear on it")
        void availabilityIsADifferentQuestion() {
            // WHERE documents may be presented is art. 6(d)(ii) and belongs to E0005. This
            // condition once read `available_with` to decide it — a field the dictionary
            // defines as the METHOD, sight or acceptance or negotiation, never the bank.
            for (String method : List.of("BY NEGOTIATION", "BY PAYMENT", "BY ACCEPTANCE")) {
                assertThat(run("20250419", "20250418", method).outcomeWord())
                        .isEqualTo("DISCREPANT");
            }
        }
    }

    @Nested
    @DisplayName("and the two doubts do not become one")
    class TwoDoubts {

        @Test
        @DisplayName("the covering schedule not presented at all is the presentation's gap")
        void notPresentedIsTheirs() {
            Evidence.Result r = evaluator.evaluate(EXPIRY,
                    List.of(new Evidence.Fact("expiry_date", "LC", "expiry_date", "20250418")),
                    Set.of("LC"));
            assertThat(r.outcomeWord()).isEqualTo("DOUBT");
            assertThat(r.reasonWord()).isEqualTo("NOT_PRESENTED");
        }

        @Test
        @DisplayName("a date nobody read is a doubt, and says whose gap it is")
        void anUnreadDateIsOurs() {
            Evidence.Result r = run(null, "20250418", "BY NEGOTIATION");
            assertThat(r.outcomeWord()).isEqualTo("DOUBT");
            // NOT_EXTRACTED, because the covering schedule is a document we hold. It is the
            // only signal that ever gets an extractor fixed.
            assertThat(r.reasonWord()).isEqualTo("NOT_EXTRACTED");
        }

        @Test
        @DisplayName("a table that chooses \"doubt\" is the rulebook, not an extraction gap")
        void theRulebooksDoubtIsItsOwn() {
            // Not this check — expiry has no doubt branch, and that is the point of the
            // correction. A table that DOES choose doubt with everything read says so.
            Map<String, Object> judged = Map.of("v", 3, "source",
                    "WHEN {CS.presentation_date} <= {LC.expiry_date}  THEN \"clean\"\n"
                            + "ELSE \"doubt\"");
            Evidence.Result r = evaluator.evaluate(judged, List.of(
                    new Evidence.Fact("presentation_date", "CS", "presentation_date", "20250419"),
                    new Evidence.Fact("expiry_date", "LC", "expiry_date", "20250418")),
                    Set.of("LC", "CS"));
            assertThat(r.outcomeWord()).isEqualTo("DOUBT");
            assertThat(r.reasonWord()).isEqualTo("HUMAN_ONLY");
        }
    }

    @Nested
    @DisplayName("the conditions, taken together")
    class Conjunction {

        @Test
        @DisplayName("stops at the first WHEN that matches, and runs no line below it")
        void firstMatchWins() {
            ExpressionRule rule = table("""
                    WHEN {a.b} <= {a.b} THEN "clean"
                    WHEN {a.b} <= {a.b} THEN "discrepancy"
                    WHEN {a.b} <= {a.b} THEN "doubt"
                    ELSE "discrepancy"
                    """);
            List<Integer> asked = new java.util.ArrayList<>();
            ExpressionRule.Decision d = rule.decide(i -> {
                asked.add(i);
                return i == 1 ? ExpressionRule.Answer.TRUE : ExpressionRule.Answer.FALSE;
            });
            assertThat(asked).containsExactly(0, 1);
            assertThat(d.verdict()).isEqualTo(ExpressionRule.Verdict.DISCREPANT);
            assertThat(d.matched()).isEqualTo(1);
        }

        @Test
        @DisplayName("an unanswerable WHEN stops the table rather than falling through")
        void unknownDoesNotFallThrough() {
            // This is the one place SQL is wrong for an examination. Postgres answers the
            // ELSE here; a date nobody read would be reported as a confident discrepancy.
            ExpressionRule rule = table("""
                    WHEN {a.b} <= {a.b} THEN "clean"
                    ELSE "discrepancy"
                    """);
            ExpressionRule.Decision d = rule.decide(i -> ExpressionRule.Answer.UNKNOWN);
            assertThat(d.verdict()).isEqualTo(ExpressionRule.Verdict.DOUBT);
            assertThat(d.unsettled()).isTrue();
            assertThat(d.matched()).isNull();
        }

        @Test
        @DisplayName("nothing matched is the ELSE, and that is not a doubt")
        void theFallbackIsAnAnswer() {
            ExpressionRule rule = table("""
                    WHEN {a.b} <= {a.b} THEN "clean"
                    ELSE "discrepancy"
                    """);
            ExpressionRule.Decision d = rule.decide(i -> ExpressionRule.Answer.FALSE);
            assertThat(d.verdict()).isEqualTo(ExpressionRule.Verdict.DISCREPANT);
            assertThat(d.unsettled()).isFalse();
        }

        @Test
        @DisplayName("a table with no ELSE is refused, and so is an unknown answer word")
        void whatIsRefused() {
            assertThat(table("WHEN {a.b} <= {a.b} THEN \"clean\"").problems())
                    .singleElement().asString().contains("no ELSE");
            assertThat(table("WHEN {a.b} <= {a.b} THEN \"maybe\"\nELSE \"clean\"").problems())
                    .singleElement().asString().contains("THEN takes");
        }

        @Test
        @DisplayName("single quotes are read, double quotes are written")
        void quoting() {
            // A condition's own literals are single-quoted because SpEL says so, and the
            // table's answer is double-quoted so the two can never be confused. Both are
            // accepted on the way in so nobody's paste is rejected over quote style.
            ExpressionRule rule = table("WHEN {a.b} <= {a.b} THEN 'clean'\nELSE 'doubt'");
            assertThat(rule.branches()).singleElement()
                    .extracting(ExpressionRule.Branch::then)
                    .isEqualTo(ExpressionRule.Verdict.CLEAN);
            assertThat(rule.otherwise()).isEqualTo(ExpressionRule.Verdict.DOUBT);
            assertThat(rule.print()).contains("THEN \"clean\"").contains("ELSE \"doubt\"");
        }

        @Test
        @DisplayName("a rule stored before the table existed still opens")
        void olderShapesStillRead() {
            ExpressionRule one = ExpressionRule.of(Map.of("when", "{LC.expiry_date} <= {LC.expiry_date}"));
            assertThat(one.branches()).singleElement()
                    .extracting(ExpressionRule.Branch::then)
                    .isEqualTo(ExpressionRule.Verdict.CLEAN);
            assertThat(one.otherwise()).isEqualTo(ExpressionRule.Verdict.DISCREPANT);
            assertThat(one.problems()).isEmpty();
        }

        private ExpressionRule table(String source) {
            return ExpressionRule.parse(source, "Every presentation");
        }
    }

    // =====================================================================

    private static final class StubCatalogue implements CheckCatalog {

        @Override
        public List<FieldBinding> bindingsFor(String docCode) {
            return switch (docCode) {
                case "LC" -> List.of(f("expiry_date", "DATE"), f("available_with", "STRING"));
                case "CS" -> List.of(f("presentation_date", "DATE"));
                default -> List.of();
            };
        }

        private static FieldBinding f(String key, String type) {
            return new FieldBinding(key, key, type, null, null, null, List.of());
        }

        @Override public List<CheckCard> activeChecks() { return List.of(); }
        @Override public List<AgentCard> agents() { return List.of(); }
        @Override public List<FieldBinding> fieldsOfKind(String kind) { return List.of(); }
        @Override public List<DocTypeDef> docTypes() {
            return List.of(new DocTypeDef("LC", "Letter of credit", null, "credit", true),
                           new DocTypeDef("CS", "Covering schedule", null, null, true));
        }
        @Override public List<CheckCard> gates() { return List.of(); }
        @Override public String articleText(String code) { return null; }
    }
}
