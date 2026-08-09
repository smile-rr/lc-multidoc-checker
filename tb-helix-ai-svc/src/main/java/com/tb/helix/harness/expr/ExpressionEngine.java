package com.tb.helix.harness.expr;

import java.util.List;
import java.util.Map;

/**
 * Compiling and running an expression over named values.
 *
 * <p>An interface because three callers want different halves of it and none should reach the
 * parser: a rulebook validates without running, an examination runs against a case, and a
 * console runs against values a person typed in to see what their rule does. The last is not
 * a lesser use — an author who can try a condition before it is stored is an author who
 * writes fewer wrong ones.
 *
 * <p>Names are opaque. {@code {BOL.on_board_date}} is a string to this; what it denotes is the
 * caller's business, and the caller supplies the value. That is what keeps one engine usable
 * by all three.
 */
public interface ExpressionEngine {

    /**
     * Parse, check and compile — never throws on bad input.
     *
     * <p>A program with problems is authored data that is wrong, not an error condition. The
     * problems name what to fix, in sentences an author can act on.
     */
    ExprProgram compile(String source);

    /**
     * Settle it against these values.
     *
     * @param values by name. A name absent from the map, or mapped to null, is <b>unknown</b>
     *               — never zero, never empty, never false. Every leaf that reads it is
     *               unknown too, and the answer is only definite if the rest of the
     *               expression forces it.
     */
    ExprResult run(String source, Map<String, Object> values);

    /**
     * Settle it against whatever a lookup can answer for the names it actually reads.
     *
     * <p>The same run, with the binding done here instead of three times above. Every caller
     * was writing the identical four lines — compile, ask the program which names it reads,
     * look each one up, <b>put it only if something came back</b> — and the third of those
     * lines is the one that must never be got wrong: a name bound to null is not the same as
     * a name left out, because Spring's comparator ranks null below every value and would
     * settle a comparison on a date nobody read.
     *
     * <p>A rule reads a fact, a console reads a box somebody typed into, an examiner's tool
     * reads the case in front of it. Three lookups, one binding rule.
     *
     * @param lookup returns the value for a name, or {@code null} for "not read". Called once
     *               per distinct name the compiled expression needs, and never for a name it
     *               does not.
     */
    default ExprResult run(String source, java.util.function.Function<String, Object> lookup) {
        ExprProgram p = compile(source);
        if (!p.ok()) return ExprResult.broken(p.problems());
        Map<String, Object> values = new java.util.LinkedHashMap<>();
        for (String name : p.names()) {
            Object v = lookup.apply(name);
            if (v != null) values.put(name, v);
        }
        return run(source, values);
    }

    /** The verbs an expression may call — the engine's own and every one registered with it. */
    List<VerbSpec> verbs();

    /**
     * The language, as prose.
     *
     * <p>One text, served to the console and given to a model writing conditions, so the two
     * cannot come to believe different things about what is allowed.
     */
    String grammar();
}
