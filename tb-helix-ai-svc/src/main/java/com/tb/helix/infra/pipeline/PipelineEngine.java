package com.tb.helix.infra.pipeline;

import java.util.List;
import java.util.function.Function;

/**
 * Runs a phase's declared steps, in order, reporting each one.
 *
 * <p>The whole engine is one loop, and its value is not the loop — it is that the loop reads
 * the declaration. Announce before, journal after, stop on a halt or a failure, record a skip
 * with its reason. Because this exists, no step body announces or journals itself, so a step
 * cannot be called one thing on a progress stream and another in storage.
 *
 * <p><b>It knows nothing about what it is running.</b> No letters of credit, no cases, no
 * officers — the context is a type parameter it never looks inside, and everything it reports
 * goes through {@link StepJournal}. That is not a claim in a comment: this class is in
 * {@code infra}, and {@code ArchitectureTest.layersDependOnlyDownward} forbids {@code infra}
 * from reaching any layer above it, so the build fails the day it learns a domain word.
 *
 * <p>Static, and deliberately not a Spring bean. It holds no state and has no
 * collaborators — it is a function over its two arguments — so there is nothing to configure
 * and nothing to substitute. Registering it as a bean would also have made domain code depend
 * on a concrete {@code @Component} in {@code infra}, which
 * {@code ArchitectureTest.domainTalksToPortsNotBeans} forbids and was right to catch.
 *
 * @see StepPhase
 */
public final class PipelineEngine {

    private PipelineEngine() {
    }

    /**
     * What a run of one or more phases ended with.
     *
     * @param lastPhase the phase that ended it — the one that halted or failed, or the last
     *                  to complete. A caller recording where the work got to needs this: on a
     *                  halt the answer is the phase that halted, not the one that was asked
     *                  for.
     */
    public record Outcome(String lastPhase, StepResult result) {
    }

    /**
     * Runs phases in order, stopping at the first that cannot continue.
     *
     * <p>Each phase gets its own context, because a context is usually bound to the phase it
     * belongs to — which is why this takes a factory rather than one instance.
     */
    public static <C extends StepJournal> Outcome run(List<? extends StepPhase<C>> phases,
                                                      Function<StepPhase<C>, C> contextFor) {
        String last = null;
        StepResult result = StepResult.ok();
        for (StepPhase<C> phase : phases) {
            last = phase.key();
            C context = contextFor.apply(phase);

            context.phaseStarted(phase.key());
            long started = System.currentTimeMillis();
            result = run(phase, context);
            context.phaseFinished(phase.key(), result, System.currentTimeMillis() - started);

            if (!result.canContinue()) break;
        }
        return new Outcome(last, result);
    }

    /**
     * Walks the phase.
     *
     * @return the result of the step that ended it — the first halt or failure, or the last
     *         step to run. A caller maps that onto whatever "the phase ended" means to it.
     *
     *         <p>The last step's result, not a fresh OK. That looked like a detail and was
     *         not: a caller deciding what the run <em>means</em> — how many findings came
     *         out of it, whether there is anything to sign off — has only this to read, and
     *         handing it a blank made every completed phase indistinguishable from an empty
     *         one. It stayed hidden for as long as no case got past the gate.
     */
    public static <C extends StepJournal> StepResult run(StepPhase<C> phase, C context) {
        StepResult last = StepResult.ok();
        for (Step<C> step : phase.steps()) {
            if (context.abandoned()) {
                return StepResult.skipped("abandoned before " + step.key());
            }
            if (!step.appliesTo(context)) {
                context.stepSkipped(phase.key(), step.key(), "nothing for this step to do");
                continue;
            }

            context.stepStarted(phase.key(), step.key(), step.label());
            long started = System.currentTimeMillis();
            last = step.run(context);
            context.stepFinished(phase.key(), step.key(), last, System.currentTimeMillis() - started);

            if (!last.canContinue()) return last;
        }
        return last;
    }
}
