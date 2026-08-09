package com.tb.helix.harness.expr;

import java.util.List;

/**
 * A compiled expression: what it reads, what it compares, and how those combine.
 *
 * <p>Data, deliberately. The compiled Spring expressions live inside the engine's cache and
 * never leave it, so nothing outside {@code harness.expr} holds a framework object and the
 * containment rule stays a rule rather than a convention.
 *
 * <p>{@link #problems} rather than an exception: an expression is authored input, and its
 * author is owed the list of what to fix rather than the first thing that threw. A program
 * with problems is not runnable, and {@link #ok()} is the only thing a caller should ask.
 */
public record ExprProgram(String source,
                          List<Read> reads,
                          List<Leaf> leaves,
                          Skeleton skeleton,
                          List<String> problems) {

    /**
     * One {@code {name}} in the source, and where it sat.
     *
     * @param slot the variable it was rewritten to. Distinct names get distinct slots; the
     *             same name used twice gets one.
     * @param from character offsets into the ORIGINAL source, so a caller can render the
     *             expression with values substituted without re-deriving anything
     */
    public record Read(int slot, String name, int from, int to) {
    }

    /**
     * One comparison — a relational operator or a boolean verb.
     *
     * <p>The unit the caller gets an answer for. A rule shows a row per leaf, which is what
     * makes an expression's evidence as readable as a form's.
     *
     * @param op    {@code ">"}, {@code "=="}, or a verb name like {@code "same"}
     * @param names the {@code {name}}s this leaf reads, in the order they appear
     */
    public record Leaf(int index, String source, String op, List<String> names) {
    }

    /**
     * The {@code and}/{@code or} above the leaves.
     *
     * <p>Three cases and no more, because the grammar allows no other connective. That is
     * what lets the skeleton be evaluated in Java over three values — true, false, unknown —
     * instead of two, and it is why the engine never hands a whole expression to Spring.
     */
    public sealed interface Skeleton permits All, Any, Ref {
    }

    public record All(List<Skeleton> parts) implements Skeleton {
    }

    public record Any(List<Skeleton> parts) implements Skeleton {
    }

    public record Ref(int leaf) implements Skeleton {
    }

    public boolean ok() {
        return problems.isEmpty() && skeleton != null;
    }

    public String why() {
        return String.join("; ", problems);
    }

    /** Every distinct name this expression reads, in the order it first reads them. */
    public List<String> names() {
        return reads.stream().map(Read::name).distinct().toList();
    }

    static ExprProgram broken(String source, List<String> problems) {
        return new ExprProgram(source, List.of(), List.of(), null, problems);
    }
}
