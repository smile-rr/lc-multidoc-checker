package com.tb.helix.harness.expr;

import java.util.List;
import java.util.Map;

/**
 * What running an expression came to — the answer, and the working behind it.
 *
 * <p>The working is not a nicety. An expression that returned only true or false would be a
 * verdict a person has to take on trust, and the whole reason a comparison beats an opinion
 * is that its steps can be read. Every leaf is here with the values it saw.
 */
public record ExprResult(Verdict verdict, List<LeafResult> leaves, String reading,
                         List<String> problems) {

    /**
     * Three values, and the third is the one that earns its place.
     *
     * <p>{@code UNKNOWN} is not a failure and not a default. It is the honest answer when a
     * value was never read: a missing input is not evidence of compliance, and a comparison
     * that quietly returned false on absence would report a discrepancy nobody found.
     */
    public enum Verdict { TRUE, FALSE, UNKNOWN }

    /**
     * One comparison, settled.
     *
     * @param critical whether this leaf decided the answer. With a monotone skeleton it can
     *                 be asked directly — flip the leaf and see whether the verdict moves —
     *                 so a caller can mark the row that mattered and dim the rest. "The first
     *                 false one" is the usual approximation and it is wrong under {@code or}.
     * @param why      plain language, for a person reading the evidence rather than a log
     */
    public record LeafResult(int index, String source, String op, Verdict outcome,
                             List<Operand> operands, boolean critical, String why) {
    }

    /**
     * One value a leaf read.
     *
     * @param resolved false means nothing was bound for this name — which is why the leaf is
     *                 unknown, and what the caller prints where the value would go
     */
    public record Operand(String name, Object value, boolean resolved) {
    }

    static ExprResult broken(List<String> problems) {
        return new ExprResult(Verdict.UNKNOWN, List.of(), null, problems);
    }

    /** Whether every name the expression reads was bound. */
    public static boolean allResolved(ExprProgram p, Map<String, Object> values) {
        return p.names().stream().allMatch(n -> values.get(n) != null);
    }
}
