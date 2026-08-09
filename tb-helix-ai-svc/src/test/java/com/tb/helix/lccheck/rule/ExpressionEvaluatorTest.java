package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.expression.DictionaryExpressionCompiler;
import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.harness.expr.SpelExpressionEngine;
import com.tb.helix.harness.expr.VerbSpec;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A stored expression, settled against what the documents said.
 *
 * <p>What is being checked here is not arithmetic — the engine has its own tests for that. It
 * is the <b>typing</b>: a fact is a string in a column and a comparison of dates is not, so
 * the difference between binding {@code "2025-4-9"} as a date and as text is the difference
 * between an answer and a wrong answer that looks right.
 */
class ExpressionEvaluatorTest {

    private static final SpelExpressionEngine ENGINE = new SpelExpressionEngine(List.of(
            VerbSpec.judged("sameParty", 2, "same party",
                    a -> PartyNames.certainlySame(String.valueOf(a.get(0)),
                            String.valueOf(a.get(1))) ? Boolean.TRUE : null)));

    private final ExpressionEvaluator evaluator = new ExpressionEvaluator(
            ENGINE, new DictionaryExpressionCompiler(new StubCatalogue(), ENGINE));

    private static RuleEvaluator.Fact fact(String doc, String field, String value) {
        return new RuleEvaluator.Fact(field, doc, field, value);
    }

    private RuleEvaluator.Result run(String when, List<RuleEvaluator.Fact> facts, String... presented) {
        return evaluator.evaluate(Map.of("when", when, "message", "It did not hold."),
                facts, Set.of(presented));
    }

    /**
     * A condition states what MUST BE TRUE, the same as a tree does — so the compliant
     * reading is {@code <=} and a failure is the discrepancy. Writing {@code >} here would
     * say that late shipment is what the credit requires, and every compliant presentation
     * would be reported as a discrepancy with nothing downstream able to notice.
     */
    @Test
    @DisplayName("a date compares as a date, however the document punctuated it")
    void datesAreTyped() {
        // "2025-4-9" sorts AFTER "20250418" as text, and after "2025-04-18" too. Read as
        // dates it is three weeks earlier and the shipment is in time. The two operands are
        // written differently on purpose: the canonical eight digits is what extraction is
        // asked for, and a document still writes what it likes.
        RuleEvaluator.Result inTime = run("{BOL.on_board_date} <= {LC.latest_shipment_date}", List.of(
                fact("BOL", "on_board_date", "2025-4-9"),
                fact("LC", "latest_shipment_date", "20250418")));
        assertThat(inTime.outcome()).isEqualTo(RuleEvaluator.Outcome.PASS);
        assertThat(inTime.outcomeWord()).isEqualTo("CLEAN");

        // En dashes and a spelt-out month, which a bill of lading really did arrive with.
        RuleEvaluator.Result late = run("{BOL.on_board_date} <= {LC.latest_shipment_date}", List.of(
                fact("BOL", "on_board_date", "20 – August – 2010"),
                fact("LC", "latest_shipment_date", "20100810")));
        assertThat(late.outcome()).isEqualTo(RuleEvaluator.Outcome.FAIL);
        assertThat(late.outcomeWord()).isEqualTo("DISCREPANT");
    }

    @Test
    @DisplayName("eight digits is the form, and six is refused rather than guessed")
    void theCanonicalForm() {
        // What extraction is asked for, on both sides.
        assertThat(run("{BOL.on_board_date} <= {LC.latest_shipment_date}", List.of(
                fact("BOL", "on_board_date", "20250419"),
                fact("LC", "latest_shipment_date", "20250418"))).outcome())
                .isEqualTo(RuleEvaluator.Outcome.FAIL);

        // SWIFT's own six. A century that has to be guessed is one that will be guessed
        // wrong on a credit issued in 1999, so it is not read at all — unknown, never a
        // date that happens to be in the wrong century.
        assertThat(run("{BOL.on_board_date} <= {LC.latest_shipment_date}", List.of(
                fact("BOL", "on_board_date", "250419"),
                fact("LC", "latest_shipment_date", "20250418"))).outcome())
                .isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);

        // Eight digits that are not a date. 31/12/2024 written the other way round is not
        // silently reinterpreted.
        assertThat(run("{BOL.on_board_date} <= {LC.latest_shipment_date}", List.of(
                fact("BOL", "on_board_date", "31122024"),
                fact("LC", "latest_shipment_date", "20250418"))).outcome())
                .isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);
    }

    @Test
    @DisplayName("an amount compares as an amount, comma decimal and all")
    void amountsAreTyped() {
        RuleEvaluator.Result r = run("{INV.invoice_value} <= {LC.credit_amount}", List.of(
                fact("INV", "invoice_value", "USD60000,01"),
                fact("LC", "credit_amount", "USD60000,00")));
        assertThat(r.outcome()).isEqualTo(RuleEvaluator.Outcome.FAIL);
    }

    @Test
    @DisplayName("a value nobody read is never a discrepancy, and says whose gap it is")
    void absenceSaysWhoseProblemItIs() {
        // The document is in the bundle and we did not read the field off it. Ours.
        RuleEvaluator.Result ours = run("{BOL.on_board_date} <= {LC.latest_shipment_date}",
                List.of(fact("LC", "latest_shipment_date", "20250418")), "LC", "BOL");
        assertThat(ours.outcome()).isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);
        assertThat(ours.reasonWord()).isEqualTo("NOT_EXTRACTED");

        // The document is not in the bundle at all. The presentation's.
        RuleEvaluator.Result theirs = run("{BOL.on_board_date} <= {LC.latest_shipment_date}",
                List.of(fact("LC", "latest_shipment_date", "20250418")), "LC");
        assertThat(theirs.reasonWord()).isEqualTo("NOT_PRESENTED");
    }

    @Test
    @DisplayName("a field read with several values is withheld rather than compared")
    void multiValuedIsNotCompared() {
        RuleEvaluator.Result r = evaluator.evaluate(
                Map.of("when", "#same({BOL.port_of_loading}, {LC.port_of_loading})"),
                List.of(new RuleEvaluator.Fact("port_of_loading", "BOL", "Port of loading",
                                "[\"SHANGHAI\",\"NINGBO\"]", true),
                        fact("LC", "port_of_loading", "SHANGHAI")),
                Set.of("LC", "BOL"));
        assertThat(r.outcome()).isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);
    }

    @Test
    @DisplayName("every comparison reaches the officer as a row, in the shared vocabulary")
    void theWorkingIsCarried() {
        RuleEvaluator.Result r = run(
                "{BOL.on_board_date} <= {LC.latest_shipment_date} and #same({INV.currency}, 'USD')",
                List.of(fact("BOL", "on_board_date", "20250410"),
                        fact("LC", "latest_shipment_date", "20250418"),
                        fact("INV", "currency", "usd")));

        assertThat(r.rows()).hasSize(2);
        // Named in the enum every screen already reads, not in the expression's own tokens.
        assertThat(r.rows().get(0).op()).isEqualTo("lte");
        assertThat(r.rows().get(1).op()).isEqualTo("eq");
        // Written back in the canonical form, whatever the fact held.
        assertThat(r.rows().get(0).left().value()).isEqualTo("20250410");
        assertThat(r.rows().get(0).left().doc()).isEqualTo("BOL");
        assertThat(r.outcome()).isEqualTo(RuleEvaluator.Outcome.PASS);
    }

    @Test
    @DisplayName("a judgement verb settles one way and asks a person for the other")
    void judgementVerbsNeverReturnFalse() {
        assertThat(run("#sameParty({INV.beneficiary_name}, {LC.beneficiary_name})", List.of(
                fact("INV", "beneficiary_name", "ACME TRADING LTD."),
                fact("LC", "beneficiary_name", "Acme Trading Ltd"))).outcome())
                .isEqualTo(RuleEvaluator.Outcome.PASS);

        // Two names that reduce apart prove nothing — a branch, a trading name, a
        // transliteration all reduce apart and are all the same party.
        assertThat(run("#sameParty({INV.beneficiary_name}, {LC.beneficiary_name})", List.of(
                fact("INV", "beneficiary_name", "ACME TRADING"),
                fact("LC", "beneficiary_name", "Zenith Industrial"))).outcome())
                .isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);
    }

    @Test
    @DisplayName("a condition that stopped compiling is unanswered, never contradicted")
    void anUnreadableConditionIsNotAFailure() {
        RuleEvaluator.Result r = run("{BOL.on_board_date} >", List.of());
        assertThat(r.outcome()).isEqualTo(RuleEvaluator.Outcome.INCONCLUSIVE);
        assertThat(r.why()).contains("could not be read");
    }

    // =====================================================================

    private static final class StubCatalogue implements CheckCatalog {

        @Override
        public List<FieldBinding> bindingsFor(String docCode) {
            return switch (docCode) {
                case "LC" -> List.of(f("latest_shipment_date", "DATE"), f("credit_amount", "AMOUNT"),
                        f("port_of_loading", "STRING"), f("beneficiary_name", "STRING"));
                case "BOL" -> List.of(f("on_board_date", "DATE"), f("port_of_loading", "STRING"));
                case "INV" -> List.of(f("invoice_value", "AMOUNT"), f("currency", "CURRENCY_CODE"),
                        f("beneficiary_name", "STRING"));
                default -> List.of();
            };
        }

        private static FieldBinding f(String key, String type) {
            return new FieldBinding(key, key, type, null, null, null, List.of());
        }

        @Override public List<CheckCard> activeChecks() { return List.of(); }
        @Override public List<AgentCard> agents() { return List.of(); }
        @Override public List<FieldBinding> fieldsOfKind(String kind) { return List.of(); }
        @Override public List<DocTypeDef> docTypes() { return List.of(); }
        @Override public List<CheckCard> gates() { return List.of(); }
        @Override public String articleText(String code) { return null; }
    }
}
