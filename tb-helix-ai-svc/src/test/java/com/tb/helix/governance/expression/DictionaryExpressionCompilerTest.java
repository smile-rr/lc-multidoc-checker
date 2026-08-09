package com.tb.helix.governance.expression;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.spi.ExpressionRules;
import com.tb.helix.harness.expr.SpelExpressionEngine;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The half of checking a condition that needs to know what a document is.
 *
 * <p>The failure being engineered against is quiet: {@code {BOL.port_of_lading}} parses
 * perfectly, is a typo, and would compile, plan, run and return "could not be settled" on
 * every presentation for ever — looking exactly like a check that ran and found nothing.
 *
 * <p>A stub catalogue rather than the seeded one, so the assertions say what they mean rather
 * than depending on which fields somebody happened to bind last week.
 */
class DictionaryExpressionCompilerTest {

    private final ExpressionRules rules =
            new DictionaryExpressionCompiler(new StubCatalogue(), new SpelExpressionEngine(List.of()));

    private List<String> problemsOf(String source) {
        return rules.check(source).problems();
    }

    @Test
    @DisplayName("a field nobody reads is caught before it is ever stored")
    void danglingReference() {
        assertThat(rules.check("{BOL.on_board_date} > {LC.latest_shipment_date}").ok()).isTrue();

        assertThat(problemsOf("{BOL.port_of_lading} == {LC.port_of_loading}"))
                .anySatisfy(p -> assertThat(p).contains("port_of_lading is not read from BOL"));
        assertThat(problemsOf("{XYZ.anything} > {LC.credit_amount}"))
                .anySatisfy(p -> assertThat(p).contains("XYZ is not a document type"));
        assertThat(problemsOf("{expiry_date} > {LC.credit_amount}"))
                .anySatisfy(p -> assertThat(p).contains("must name a document and a field"));
    }

    @Test
    @DisplayName("a field read off no document at all cannot be read off every document")
    void wildcardNeedsSomethingToMatch() {
        assertThat(rules.check("#same({*.beneficiary_name}, {LC.beneficiary_name})").ok()).isTrue();
        assertThat(problemsOf("#same({*.nobody_reads_this}, {LC.beneficiary_name})"))
                .anySatisfy(p -> assertThat(p).contains("is not read from any document"));
    }

    /**
     * Advisory in nature, refusing in effect. Comparing a date with an amount is not
     * dangerous — the engine answers "could not be settled", which is true — it is simply
     * never what the author meant, and now is when that is cheap to find out.
     */
    @Test
    @DisplayName("what cannot sensibly be compared is said at authoring time")
    void theTypePass() {
        assertThat(problemsOf("{LC.currency} > {INV.currency}"))
                .anySatisfy(p -> assertThat(p).contains("text has no order"));
        assertThat(problemsOf("{LC.currency} == {INV.currency}"))
                .anySatisfy(p -> assertThat(p).contains("use #same"));
        assertThat(problemsOf("{BOL.on_board_date} > {LC.credit_amount}"))
                .anySatisfy(p -> assertThat(p).contains("not the same kind of value"));

        // Text compared the way text should be compared is fine.
        assertThat(rules.check("#same({LC.currency}, {INV.currency})").ok()).isTrue();
    }

    @Test
    @DisplayName("a field the dictionary says nothing about is not second-guessed")
    void silenceIsNotAType() {
        // `remarks` has no valueType. Asserting a kind we were not told is how a type pass
        // starts refusing conditions that are perfectly correct.
        assertThat(rules.check("{INV.remarks} > {LC.credit_amount}").ok()).isTrue();
    }

    @Test
    @DisplayName("attestations are not readable by a condition, the same line the tree draws")
    void attestationsAreNotFields() {
        assertThat(problemsOf("#present({BOL.signed})"))
                .anySatisfy(p -> assertThat(p).contains("signed is not read from BOL"));
    }

    @Test
    @DisplayName("the vocabulary is generated, so the console and a model cannot disagree")
    void vocabularyNamesWhatMayBeRead() {
        String v = rules.vocabulary();
        assertThat(v).contains("{BOL.on_board_date}").contains("{LC.credit_amount}");
        assertThat(v).doesNotContain("{BOL.signed}");    // an attestation, not a field
        assertThat(v).contains("date").contains("amount");
    }

    // =====================================================================

    /** Five fields, one attestation, one deliberately untyped. Enough to mean something. */
    private static final class StubCatalogue implements CheckCatalog {

        @Override
        public List<DocTypeDef> docTypes() {
            return List.of(
                    new DocTypeDef("LC", "Letter of credit", "", "credit", true),
                    new DocTypeDef("BOL", "Bill of lading", "", "presented", false),
                    new DocTypeDef("INV", "Commercial invoice", "", "presented", false));
        }

        @Override
        public List<FieldBinding> bindingsFor(String docCode) {
            return switch (docCode) {
                case "LC" -> List.of(
                        field("latest_shipment_date", "DATE", "LC"),
                        field("credit_amount", "AMOUNT", "LC"),
                        field("currency", "CURRENCY_CODE", "LC"),
                        field("port_of_loading", "STRING", "LC"),
                        field("beneficiary_name", "STRING", "LC"));
                case "BOL" -> List.of(
                        field("on_board_date", "DATE", "BOL"),
                        field("port_of_loading", "STRING", "BOL"),
                        field("beneficiary_name", "STRING", "BOL"),
                        new FieldBinding("signed", "Signed", "BOOLEAN", ATTESTATION, "BOL", null, List.of()));
                case "INV" -> List.of(
                        field("currency", "CURRENCY_CODE", "INV"),
                        field("invoice_value", "AMOUNT", "INV"),
                        new FieldBinding("remarks", "Remarks", null, null, "INV", null, List.of()));
                default -> List.of();
            };
        }

        private static FieldBinding field(String key, String type, String doc) {
            return new FieldBinding(key, key, type, null, doc, null, List.of());
        }

        @Override public List<CheckCard> activeChecks() { return List.of(); }
        @Override public List<AgentCard> agents() { return List.of(); }
        @Override public List<FieldBinding> fieldsOfKind(String kind) { return List.of(); }
        @Override public List<CheckCard> gates() { return List.of(); }
        @Override public String articleText(String code) { return null; }
    }
}
