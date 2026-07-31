package com.tb.helix.infra.pipeline;

import java.util.function.Function;
import java.util.function.Predicate;

/**
 * One unit of work, declared rather than written.
 *
 * <p>A step is data with a body attached: a stable key, a label for a person, a predicate
 * saying whether it applies, and the work itself. Because the engine has the declaration it
 * can announce and journal each step, which is what keeps the reporting out of the bodies —
 * and stops the same step being named one way on a progress stream and another in storage.
 *
 * @param <C> whatever the steps need to do their work. The engine never looks inside it.
 */
public interface Step<C> {

    /** Stable identity: storage, wire, documentation. Part of the contract. */
    String key();

    /** What a person would call it. A caller may translate on {@link #key()} instead. */
    String label();

    /**
     * Whether this step has anything to do.
     *
     * <p>Declared rather than an early return inside the body, so "not applicable" is
     * visible in the declaration and gets journalled with a reason.
     */
    default boolean appliesTo(C context) {
        return true;
    }

    StepResult run(C context);

    static <C> Step<C> of(String key, String label, Function<C, StepResult> body) {
        return of(key, label, c -> true, body);
    }

    /** @param when when the step applies, expressed positively */
    static <C> Step<C> of(String key, String label, Predicate<C> when, Function<C, StepResult> body) {
        return new Step<>() {
            @Override
            public String key() {
                return key;
            }

            @Override
            public String label() {
                return label;
            }

            @Override
            public boolean appliesTo(C context) {
                return when.test(context);
            }

            @Override
            public StepResult run(C context) {
                return body.apply(context);
            }
        };
    }
}
