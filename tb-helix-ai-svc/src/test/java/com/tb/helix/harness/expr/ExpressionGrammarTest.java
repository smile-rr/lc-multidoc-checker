package com.tb.helix.harness.expr;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The one test class this repository asks for, and the reason is worth stating.
 *
 * <p>The safety net here is a clean compile, the architecture rules, the migration checks and
 * the UI's render targets. <b>Not one of them can observe a hole in the whitelist.</b> A
 * construct that should be refused but is accepted compiles cleanly, passes every boundary
 * rule, touches no migration and renders identically in the browser — while being a remote
 * code execution on a string a model wrote. Every other decision in this package is protected
 * by something; this one is protected by nothing.
 *
 * <p>It is also the cheapest test in the codebase: no Spring context, no database, no model,
 * no fixtures. That is what makes it affordable where a broad suite is not.
 */
class ExpressionGrammarTest {

    private final ExpressionEngine engine = new SpelExpressionEngine(List.of());

    private List<String> problemsOf(String source) {
        return engine.compile(source).problems();
    }

    private void refuses(String source, String because) {
        assertThat(engine.compile(source).ok())
                .as("%s should be refused: %s", source, because)
                .isFalse();
        assertThat(problemsOf(source)).isNotEmpty();
    }

    private void accepts(String source) {
        ExprProgram p = engine.compile(source);
        assertThat(p.ok()).as("%s should compile, but: %s", source, p.why()).isTrue();
    }

    // =====================================================================
    // The security boundary
    // =====================================================================

    @Nested
    @DisplayName("what may never reach the evaluator")
    class Refused {

        /**
         * One case per refused node class. This is the row that rots when Spring adds or
         * renames one, and catching that is the whole point of writing them out.
         */
        @Test
        void everyDangerousConstruct() {
            refuses("T(java.lang.Runtime).getRuntime() == {a}", "the textbook SpEL RCE");
            refuses("@dataSource == {a}", "reaches the application context");
            refuses("new java.net.URL('http://x') == {a}", "constructs objects");
            refuses("'x'.getClass() == {a}", "arbitrary method invocation");
            refuses("foo > {a}", "a bare identifier is nothing this reads");
            refuses("{a}.class > {b}", "navigation is the head of every gadget chain");
            refuses("{a}['k'] > {b}", "indexing navigates too");
            refuses("{a} = 1", "a condition does not assign");
        }

        @Test
        void constructsThatBreakThreeValuedLogic() {
            refuses("!(#present({a}))", "negation makes the double run unsound");
            refuses("{a} ? {b} > 1 : {c} > 1", "a ternary can invent an answer from nothing read");
            refuses("({a} ?: {b}) > 1", "elvis implies a null this language does not have");
        }

        @Test
        void constructsWithNoMeaningHere() {
            refuses("{a} matches 'x.*'", "the guarded #matches is the way to do this");
            refuses("{a} instanceof T(String)", "no meaning here");
            refuses("{a} == null", "absence is asked with #absent, never compared to null");
        }

        /**
         * The braces are both the way a value is named and Spring's inline-list literal. The
         * rewrite has to win, or {1,2} reaches the parser as a real collection.
         */
        @Test
        void braceLiteralsCannotSurviveTheRewrite() {
            refuses("{1,2} == {a}", "an inline list is not a name");
            refuses("{a} > {", "an unclosed brace is a typo, not a grammar");
        }

        @Test
        void unknownVerbsAndWrongArity() {
            refuses("#nosuchverb({a}, {b})", "a verb the engine does not have");
            refuses("#same({a})", "#same takes two arguments");
            assertThat(problemsOf("#same({a})")).first().asString().contains("2 arguments");
        }

        @Test
        void theLimits() {
            refuses("{a} > " + "1".repeat(SpelExpressionEngine.MAX_SOURCE), "too long to check");
            refuses(String.join(" and ", java.util.Collections.nCopies(70, "{a}>1")),
                    "more parts than can be walked");

            StringBuilder wide = new StringBuilder("#present({n0})");
            for (int i = 1; i < 30; i++) wide.append(" and #present({n").append(i).append("})");
            refuses(wide.toString(), "reads more different things than it may");
        }
    }

    // =====================================================================
    // What the language is for
    // =====================================================================

    @Nested
    @DisplayName("what an author may write")
    class Accepted {

        @Test
        void comparisonsAndConnectives() {
            accepts("{BOL.on_board_date} > {LC.latest_shipment_date}");
            accepts("{INV.invoice_value} <= {LC.credit_amount}");
            accepts("{a} > {b} and {c} <= {d}");
            accepts("{a} > {b} or ({c} <= {d} and {e} == {f})");
        }

        @Test
        void verbsAndArithmetic() {
            accepts("#same({INV.currency}, 'USD')");
            accepts("#daysBetween({CS.presentation_date}, {BOL.on_board_date}) > 21");
            accepts("{CS.presentation_date} <= #datePlus({BOL.on_board_date}, 21)");
            accepts("#present({BOL.signed})");
            accepts("{INV.value} == {INV.qty} * {INV.unit_price}");
        }

        @Test
        void aNameUsedTwiceIsOneRead() {
            ExprProgram p = engine.compile("{a} > {b} and {a} < {c}");
            assertThat(p.names()).containsExactly("a", "b", "c");
            assertThat(p.reads()).hasSize(4);      // four occurrences, three names
        }

        @Test
        void everyLeafIsARow() {
            ExprProgram p = engine.compile("{a} > {b} and #same({c}, 'X')");
            assertThat(p.leaves()).hasSize(2);
            assertThat(p.leaves().get(0).op()).isEqualTo(">");
            assertThat(p.leaves().get(1).op()).isEqualTo("same");
            // Shown back in the author's own words, not in the rewritten form.
            assertThat(p.leaves().get(0).source()).isEqualTo("{a} > {b}");
        }
    }

    // =====================================================================
    // Absence, which is the correctness property
    // =====================================================================

    @Nested
    @DisplayName("a value that was not read")
    class Absence {

        @Test
        void neverSettlesAComparison() {
            ExprResult r = engine.run("{a} > {b}", Map.of("a", LocalDate.of(2025, 4, 18)));
            assertThat(r.verdict()).isEqualTo(ExprResult.Verdict.UNKNOWN);
            assertThat(r.leaves()).first().extracting(ExprResult.LeafResult::why).asString()
                    .contains("b was not read");
        }

        /**
         * The property everything else rests on. Spring's comparator ranks null below every
         * value, so an unread date reaching {@code >} would come back FALSE — a discrepancy
         * on a presentation where nothing was read.
         */
        @Test
        void isNeverSilentlyFalse() {
            ExprResult r = engine.run("{a} > {b}", Map.of());
            assertThat(r.verdict()).isNotEqualTo(ExprResult.Verdict.FALSE);
        }

        @Test
        void doesNotStopTheRestFromForcingAnAnswer() {
            // One branch of an `or` held, so the unread one cannot change the answer.
            ExprResult held = engine.run("{a} > {b} or {c} > {d}",
                    Map.of("c", new BigDecimal("5"), "d", new BigDecimal("1")));
            assertThat(held.verdict()).isEqualTo(ExprResult.Verdict.TRUE);

            // One branch of an `and` failed, likewise.
            ExprResult failed = engine.run("{a} > {b} and {c} > {d}",
                    Map.of("c", new BigDecimal("1"), "d", new BigDecimal("5")));
            assertThat(failed.verdict()).isEqualTo(ExprResult.Verdict.FALSE);
        }

        @Test
        void isTheAnswerForThePresenceVerbs() {
            assertThat(engine.run("#absent({a})", Map.of()).verdict())
                    .isEqualTo(ExprResult.Verdict.TRUE);
            assertThat(engine.run("#present({a})", Map.of()).verdict())
                    .isEqualTo(ExprResult.Verdict.FALSE);
        }
    }

    // =====================================================================
    // Running
    // =====================================================================

    @Nested
    @DisplayName("settling a condition")
    class Running {

        @Test
        void datesCompareAsDates() {
            Map<String, Object> late = Map.of(
                    "BOL.on_board_date", LocalDate.of(2025, 4, 18),
                    "LC.latest_shipment_date", LocalDate.of(2025, 4, 10));
            ExprResult r = engine.run("{BOL.on_board_date} > {LC.latest_shipment_date}", late);
            assertThat(r.verdict()).isEqualTo(ExprResult.Verdict.TRUE);
        }

        @Test
        void amountsCompareExactly() {
            Map<String, Object> over = Map.of(
                    "INV.value", new BigDecimal("60000.01"),
                    "LC.amount", new BigDecimal("60000.00"));
            assertThat(engine.run("{INV.value} <= {LC.amount}", over).verdict())
                    .isEqualTo(ExprResult.Verdict.FALSE);
        }

        @Test
        void theReadingShowsWhatWasCompared() {
            ExprResult r = engine.run("{a} > {b}",
                    Map.of("a", LocalDate.of(2025, 4, 18), "b", LocalDate.of(2025, 4, 10)));
            assertThat(r.reading()).isEqualTo("20250418 > 20250410");
        }

        @Test
        void anUnreadValueIsSaidSoInTheReading() {
            assertThat(engine.run("{a} > {b}", Map.of("a", "x")).reading())
                    .isEqualTo("x > — not read —");
        }

        /**
         * "The first false leaf" is the usual approximation and it is wrong under `or`: there,
         * a false leaf beside a true one decided nothing.
         */
        @Test
        void theDecisiveLeafIsAskedForNotGuessedAt() {
            ExprResult r = engine.run("{a} > {b} or {c} > {d}", Map.of(
                    "a", new BigDecimal("1"), "b", new BigDecimal("5"),      // false
                    "c", new BigDecimal("5"), "d", new BigDecimal("1")));    // true
            assertThat(r.verdict()).isEqualTo(ExprResult.Verdict.TRUE);
            assertThat(r.leaves().get(0).critical()).isFalse();
            assertThat(r.leaves().get(1).critical()).isTrue();
        }

        @Test
        void aVerbThatCannotUseItsArgumentsIsUnknownNotFalse() {
            // A value was read; it is simply not a date.
            ExprResult r = engine.run("#daysBetween({a}, {b}) > 21",
                    Map.of("a", "not a date", "b", "also not"));
            assertThat(r.verdict()).isEqualTo(ExprResult.Verdict.UNKNOWN);
        }

        @Test
        void textFoldsOnlyWhereTheVerbSaysItDoes() {
            assertThat(engine.run("#same({a}, 'usd')", Map.of("a", "USD")).verdict())
                    .isEqualTo(ExprResult.Verdict.TRUE);
            // `==` is exact, deliberately: an author who wants folding asks for it.
            assertThat(engine.run("{a} == 'usd'", Map.of("a", "USD")).verdict())
                    .isEqualTo(ExprResult.Verdict.FALSE);
        }
    }

    // =====================================================================
    // The vocabulary is served, never restated
    // =====================================================================

    @Test
    void theGrammarNamesEveryVerbItHas() {
        String grammar = engine.grammar();
        for (VerbSpec v : engine.verbs()) {
            assertThat(grammar).contains("#" + v.name());
        }
    }

    @Test
    void aContributedVerbIsUsable() {
        ExpressionEngine withParty = new SpelExpressionEngine(List.of(
                VerbSpec.bool("sameParty", 2, "two names denote the same party",
                        a -> String.valueOf(a.get(0)).startsWith(String.valueOf(a.get(1))))));
        assertThat(withParty.run("#sameParty({a}, {b})",
                Map.of("a", "ACME TRADING LTD", "b", "ACME")).verdict())
                .isEqualTo(ExprResult.Verdict.TRUE);
    }
}
