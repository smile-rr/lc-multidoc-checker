package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.expression.DictionaryExpressionCompiler;
import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.types.ExpressionRule;
import com.tb.helix.harness.expr.SpelExpressionEngine;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A table whose conditions are not all comparisons.
 *
 * <p>The property under test is the one the whole design rests on: <b>the examiner answers a
 * condition, and the table decides the outcome.</b> Nothing a model returns can name an
 * outcome, and nothing it fails to return can produce a discrepancy.
 *
 * <p>The second property is money. A question is only asked when a walk could actually arrive
 * at it, so a table whose cheap comparison comes first costs nothing on the presentations that
 * comparison covers.
 */
class JudgedConditionTest {

    private static final SpelExpressionEngine ENGINE = new SpelExpressionEngine(List.of());

    private final ExpressionEvaluator evaluator = new ExpressionEvaluator(
            ENGINE, new DictionaryExpressionCompiler(new StubCatalogue(), ENGINE));

    /** A comparison first, then a question. The shape an author is meant to write. */
    private static final Map<String, Object> GOODS = Map.of("v", 3, "source", """
            WHEN #same({INV.goods_description}, {LC.goods_description})   THEN "clean"
            WHEN "the invoice describes a different product from the
                  credit, beyond the generality art. 14(d) permits"       THEN "discrepancy"
            ELSE "doubt"
            """);

    private static List<Evidence.Fact> facts(String invoice, String credit) {
        return List.of(new Evidence.Fact("goods_description", "INV", "goods", invoice),
                new Evidence.Fact("goods_description", "LC", "goods", credit));
    }

    private Evidence.Result run(List<Evidence.Fact> facts,
                                     ExpressionRule.Answer said, String because) {
        return evaluator.evaluate(GOODS, facts, Set.of("LC", "INV"),
                new ExpressionEvaluator.Judged(Map.of(1, said), Map.of(1, because)));
    }

    @Nested
    @DisplayName("what is asked, and what is not")
    class WhatIsAsked {

        @Test
        @DisplayName("a comparison that matches first asks nothing at all")
        void theCheapBranchIsFree() {
            // Identical descriptions: the first branch matches, so the question below it is
            // never reached and never billed.
            assertThat(evaluator.pending(GOODS, facts("COTTON SHIRTS", "COTTON SHIRTS")))
                    .isEmpty();
        }

        @Test
        @DisplayName("a comparison that does not match reaches the question")
        void theQuestionIsReached() {
            assertThat(evaluator.pending(GOODS, facts("COTTON SHIRTS", "SILK SHIRTS")))
                    .containsExactly(1);
        }

        @Test
        @DisplayName("a comparison that cannot be settled asks nothing, and is a doubt")
        void anUnsettleableComparisonStopsBeforeTheQuestion() {
            // The credit's description was never read. We do not know that the first branch
            // failed, so we cannot know the question is reached — and paying a model to
            // answer a question the table may never arrive at is spending on a guess.
            List<Evidence.Fact> half =
                    List.of(new Evidence.Fact("goods_description", "INV", "goods", "COTTON"));
            assertThat(evaluator.pending(GOODS, half)).isEmpty();
            assertThat(evaluator.evaluate(GOODS, half, Set.of("LC", "INV")).outcomeWord())
                    .isEqualTo("DOUBT");
        }
    }

    @Nested
    @DisplayName("the examiner answers a condition; the table decides")
    class WhoDecides {

        @Test
        @DisplayName("true on the question gives that branch's answer, not the model's")
        void trueTakesTheBranch() {
            Evidence.Result r = run(facts("COTTON SHIRTS", "SILK SHIRTS"),
                    ExpressionRule.Answer.TRUE, "The invoice says cotton and the credit silk.");
            assertThat(r.outcomeWord()).isEqualTo("DISCREPANT");
        }

        @Test
        @DisplayName("false falls to the ELSE, and the ELSE is the author's")
        void falseFallsThrough() {
            Evidence.Result r = run(facts("100 PCS COTTON SHIRTS", "COTTON SHIRTS, 100 PIECES"),
                    ExpressionRule.Answer.FALSE, "Same goods, ordered differently.");
            assertThat(r.outcomeWord()).isEqualTo("DOUBT");
        }

        @Test
        @DisplayName("an examiner that did not answer cannot produce a discrepancy")
        void silenceIsDoubt() {
            // No entry at all — a garbled reply, a call that failed, a spent budget. Every
            // one of those must land here, and it must land on doubt.
            Evidence.Result r = evaluator.evaluate(GOODS,
                    facts("COTTON SHIRTS", "SILK SHIRTS"), Set.of("LC", "INV"),
                    ExpressionEvaluator.Judged.none());
            assertThat(r.outcomeWord()).isEqualTo("DOUBT");
            // The rulebook's doubt rather than an extraction gap: both descriptions were read.
            assertThat(r.reasonWord()).isEqualTo("HUMAN_ONLY");
        }
    }

    @Nested
    @DisplayName("the question reaches the officer as evidence")
    class ReachesTheOfficer {

        @Test
        @DisplayName("it is a row, with what was asked and what was said")
        void theQuestionIsARow() {
            Evidence.Result r = run(facts("COTTON SHIRTS", "SILK SHIRTS"),
                    ExpressionRule.Answer.TRUE, "The invoice says cotton and the credit silk.");

            // Both branches evaluated: the comparison that did not match, then the question.
            assertThat(r.rows()).hasSize(2);
            Evidence.RowResult asked = r.rows().get(1);
            assertThat(asked.label()).contains("beyond the generality art. 14(d) permits");
            assertThat(asked.why()).isEqualTo("The invoice says cotton and the credit silk.");
        }

        @Test
        @DisplayName("a question wrapped across lines is one sentence")
        void lineBreaksAreTheAuthorsMargin() {
            ExpressionRule rule = ExpressionRule.parse(String.valueOf(GOODS.get("source")), null);
            assertThat(rule.branches().get(1).ask())
                    .isEqualTo("the invoice describes a different product from the "
                            + "credit, beyond the generality art. 14(d) permits");
        }
    }

    @Nested
    @DisplayName("what the parser must not confuse")
    class Parsing {

        @Test
        @DisplayName("a double-quoted operand INSIDE a comparison is not a question")
        void anOperandIsNotAQuestion() {
            // The condition does not BEGIN with a quote, so it is a comparison whose second
            // operand happens to be written that way.
            ExpressionRule rule = ExpressionRule.parse(
                    "WHEN #same({INV.currency}, \"USD\")  THEN \"clean\"\nELSE \"discrepancy\"", null);
            assertThat(rule.branches()).singleElement()
                    .satisfies(b -> assertThat(b.judged()).isFalse());
            assertThat(rule.judged()).isFalse();
        }

        @Test
        @DisplayName("a question is never sent to the compiler")
        void questionsAreNotCompiled() {
            ExpressionRule rule = ExpressionRule.parse(String.valueOf(GOODS.get("source")), null);
            // Only the comparison. Refusing a check because its question is not valid SpEL
            // would make the whole feature unusable.
            assertThat(rule.sources()).singleElement().asString().contains("#same");
            assertThat(rule.problems()).isEmpty();
            assertThat(rule.judged()).isTrue();
        }

        @Test
        @DisplayName("a question survives a round trip through print")
        void roundTrip() {
            ExpressionRule rule = ExpressionRule.parse(String.valueOf(GOODS.get("source")), null);
            ExpressionRule again = ExpressionRule.parse(rule.print(), null);
            assertThat(again.branches()).hasSize(2);
            assertThat(again.branches().get(1).ask()).isEqualTo(rule.branches().get(1).ask());
            assertThat(again.otherwise()).isEqualTo(ExpressionRule.Verdict.DOUBT);
        }
    }

    // =====================================================================

    private static final class StubCatalogue implements CheckCatalog {

        @Override
        public List<FieldBinding> bindingsFor(String docCode) {
            return switch (docCode) {
                case "LC", "INV" -> List.of(new FieldBinding("goods_description",
                        "goods_description", "STRING", null, null, null, List.of()));
                default -> List.of();
            };
        }

        @Override public List<CheckCard> activeChecks() { return List.of(); }
        @Override public List<AgentCard> agents() { return List.of(); }
        @Override public List<FieldBinding> fieldsOfKind(String kind) { return List.of(); }
        @Override public List<DocTypeDef> docTypes() {
            return List.of(new DocTypeDef("LC", "Letter of credit", null, "credit", true),
                           new DocTypeDef("INV", "Commercial invoice", null, null, false));
        }
        @Override public List<CheckCard> gates() { return List.of(); }
        @Override public String articleText(String code) { return null; }
    }
}
