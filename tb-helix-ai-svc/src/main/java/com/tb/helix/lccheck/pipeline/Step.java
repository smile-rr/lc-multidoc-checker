package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.types.pipeline.StepResult;

import java.util.function.Function;
import java.util.function.Predicate;

/**
 * One unit of work inside a stage, declared rather than buried.
 *
 * <p>The problem this solves: a stage used to express its steps as control flow — an
 * {@code if} here, a loop there, a {@code ctx.progress("credit", "Reading the credit")}
 * call in the middle of a method. That made the flow unreadable without reading every
 * method body, and unlistable from anywhere. Four separate places ended up describing the
 * same pipeline — the stage enum, the strings inside the stages, and two constants in the
 * browser — and none was derived from the others, so they drifted and nothing failed.
 *
 * <p>A step is data with a body attached. Because the runner has the declaration, it does
 * the reporting: it emits progress before the step, records the step tape after it, and
 * marks a skip with its reason. Stages no longer call {@code progress} or {@code recordStep}
 * at all, which is why the strings stopped multiplying.
 *
 * <h2>key and label</h2>
 *
 * <p>{@link #key()} is the stable identity — the {@code step_key} column, the SSE payload,
 * the {@code /flow} document. It is part of the contract and does not change casually.
 *
 * <p>{@link #label()} is English prose for a person. It ships alongside the key rather than
 * instead of it, so a browser that wants to render "读取信用证" can translate on the key and
 * fall back to the label when it has no translation. Shipping only the label would have made
 * that impossible; shipping only the key would make the stream unreadable to anyone
 * debugging it.
 */
public interface Step {

    /** Stable identity: DB column, SSE payload, flow document. */
    String key();

    /** What a person would call it. English; the browser may translate on {@link #key()}. */
    String label();

    /**
     * Whether this step has anything to do on this case.
     *
     * <p>Declared rather than an early {@code return} inside the body, so "not applicable"
     * is visible in the flow document and lands on the step tape with a reason. An examiner
     * has to be able to say what was <em>not</em> checked.
     */
    default boolean appliesTo(StageContext ctx) {
        return true;
    }

    StepResult run(StageContext ctx);

    // --- Construction --------------------------------------------------------

    static Step of(String key, String label, Function<StageContext, StepResult> body) {
        return of(key, label, ctx -> true, body);
    }

    /** @param when why the step would be skipped, expressed positively */
    static Step of(String key, String label, Predicate<StageContext> when,
                   Function<StageContext, StepResult> body) {
        return new Step() {
            @Override
            public String key() {
                return key;
            }

            @Override
            public String label() {
                return label;
            }

            @Override
            public boolean appliesTo(StageContext ctx) {
                return when.test(ctx);
            }

            @Override
            public StepResult run(StageContext ctx) {
                return body.apply(ctx);
            }
        };
    }
}
