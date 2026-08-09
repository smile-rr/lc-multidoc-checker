package com.tb.helix.harness.expr;

import java.util.List;
import java.util.function.Function;

/**
 * A verb an expression may call, declared by the module that understands it.
 *
 * <p>{@code #daysBetween(a, b)} is arithmetic and ships with the engine. Whether two party
 * names denote the same party is a judgement about trade documents, and the engine has no
 * business holding an opinion about it — so it is registered from outside, exactly as
 * {@code ToolSpec} is, and for the same reason: a vocabulary kept in the module that knows
 * what the words mean does not drift from it.
 *
 * <p>A verb is a <em>function</em>, not an operator: it has a name, a fixed arity, and it is
 * validated by name before anything runs. That closed vocabulary is what makes an expression
 * checkable in advance. Adding arbitrary method invocation would make it an expression
 * language in the dangerous sense, and there would be nothing left to check.
 *
 * @param name    what an author writes after the {@code #}. Stable: it appears in stored
 *                rules, so renaming one breaks every check that used it.
 * @param arity   how many arguments, exactly. {@code -1} means two or more.
 * @param returns whether calling it settles a comparison ({@code BOOLEAN}) or produces a value
 *                for one ({@code VALUE}). A leaf is a boolean verb or a relational operator;
 *                a value verb can only appear inside one.
 * @param about   one line, shown to an author and given to a model writing conditions
 * @param judgement whether answering it is a reading rather than a comparison. Declared by
 *                whoever contributes the verb, because only they know: two company names
 *                that reduce to the same characters are certainly the same party, and two
 *                that do not are not certainly different — so a program can prove one half
 *                of {@code #sameParty} and never the other. A check using such a verb is
 *                <b>judged</b>, whatever its author typed, and may never be a threshold
 *                check: gating on a judgement spends the money the gate exists to save, on
 *                the least evidence there will ever be.
 * @param fn      receives the evaluated arguments in order and returns the result. Returns
 *                {@code null} for "cannot say" — never throws for bad input, because an
 *                argument that could not be used is an unknown leaf and not a failed run.
 */
public record VerbSpec(String name, int arity, Returns returns, String about,
                       boolean judgement, Function<List<Object>, Object> fn) {

    public enum Returns { BOOLEAN, VALUE }

    /** Whether this many arguments is the right number. */
    public boolean accepts(int count) {
        return arity < 0 ? count >= 2 : count == arity;
    }

    public String arityComplaint(int count) {
        return arity < 0
                ? "#" + name + " needs two or more arguments, and was given " + count
                : "#" + name + " takes " + arity + (arity == 1 ? " argument" : " arguments")
                        + ", and was given " + count;
    }

    /** Settles a comparison outright. */
    public static VerbSpec bool(String name, int arity, String about,
                                Function<List<Object>, Object> fn) {
        return new VerbSpec(name, arity, Returns.BOOLEAN, about, false, fn);
    }

    /** Produces a value for a comparison to use. */
    public static VerbSpec value(String name, int arity, String about,
                                 Function<List<Object>, Object> fn) {
        return new VerbSpec(name, arity, Returns.VALUE, about, false, fn);
    }

    /**
     * Settles a comparison one way only, and needs a person for the other.
     *
     * <p>The handler may return true, or nothing. It must never return false: a negative
     * proves nothing — a trading name, a branch, a transliteration all reduce apart and are
     * all the same party — so "not certainly the same" is a question for an examiner rather
     * than an answer.
     */
    public static VerbSpec judged(String name, int arity, String about,
                                  Function<List<Object>, Object> fn) {
        return new VerbSpec(name, arity, Returns.BOOLEAN, about, true, fn);
    }
}
