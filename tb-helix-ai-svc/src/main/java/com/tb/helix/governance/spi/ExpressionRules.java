package com.tb.helix.governance.spi;

import com.tb.helix.harness.expr.ExprProgram;

import java.util.List;

/**
 * An expression, checked against the rulebook's own dictionary.
 *
 * <p>Two checks, and they belong in different places. Whether {@code {a} > {b}} is a
 * well-formed and safe condition is the engine's question, and it knows nothing about
 * documents. Whether {@code {BOL.on_board_date}} is a thing anybody reads off a bill of lading
 * is the dictionary's, and the engine has no business knowing. This is the second one, and it
 * runs the first on the way.
 *
 * <p>Declared here rather than in the governance module proper because lc-check needs it — the
 * planner writes conditions and cannot tell whether what it wrote will be accepted — and
 * lc-check may see {@code governance.types} and {@code governance.spi} and nothing else.
 *
 * <p>The engine's own types travel through this because {@code harness} sits below both
 * modules: a caller that has the program can render its leaves without asking twice.
 */
public interface ExpressionRules {

    /**
     * Compile it, and check every name it reads.
     *
     * <p>Never throws. A condition that does not compile is authored data that is wrong, and
     * its author is owed the list rather than the first thing that failed.
     */
    Checked check(String source);

    /**
     * @param program   the compiled expression. Present even when there are problems, whenever
     *                  the grammar was satisfied — so an editor can still show the leaves it
     *                  did understand while naming the name it did not.
     * @param reads     what it reads, as document and field. The same knowledge the
     *                  {@code jsonb_path_query} over a tree's operands produces, for an
     *                  expression SQL cannot parse — which is why it is stored beside the
     *                  check rather than derived from it.
     * @param judgement whether any verb it calls is a reading rather than a comparison. A
     *                  check using one is judged whatever its author typed, and can never be
     *                  a threshold check.
     */
    record Checked(ExprProgram program, List<String> problems,
                   List<Read> reads, boolean judgement) {

        /** One {@code {DOCUMENT.field}}, split. {@code doc} may be {@code *}. */
        public record Read(String doc, String field) {
        }

        public boolean ok() {
            return problems.isEmpty() && program != null && program.ok();
        }

        public String why() {
            return String.join("; ", problems);
        }
    }

    /**
     * Every name a condition may read, by document.
     *
     * <p>One text, served to the console and given to a model writing conditions, so neither
     * has to restate the dictionary and the two cannot come to disagree about it.
     */
    String vocabulary();

    /**
     * Text, as the kind of value the dictionary says this name holds.
     *
     * <p>Here rather than beside either caller because there are two, they are on opposite
     * sides of a module boundary, and they must not disagree. A run reads
     * {@code {CS.presentation_date}} off a fact; the console reads it out of a box somebody
     * typed into. When the console bound plain text instead,
     * {@code {CS.presentation_date} <= #datePlus({LC.expiry_date}, 5)} compared a String with
     * a LocalDate and reported that it could not be answered — while the same condition on the
     * same dates answered perfectly on a real case. A simulator that disagrees with the run is
     * worse than none, because an author believes it.
     *
     * @return a {@code LocalDate}, a {@code BigDecimal} or the text itself; null when there is
     *         nothing to bind, which is never the same as false
     */
    Object read(String name, String text);

    /** The grammar and the verbs, from the engine, for the same reason. */
    String grammar();
}
