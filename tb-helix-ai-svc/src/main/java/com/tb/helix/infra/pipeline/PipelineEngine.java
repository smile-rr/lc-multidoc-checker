package com.tb.helix.infra.pipeline;

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
     * Walks the phase.
     *
     * @return the result that ended it — the first halt or failure, or OK when every step
     *         ran. A caller maps that onto whatever "the phase ended" means to it.
     */
    public static <C extends StepJournal> StepResult run(StepPhase<C> phase, C context) {
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
            StepResult result = step.run(context);
            context.stepFinished(phase.key(), step.key(), result, System.currentTimeMillis() - started);

            if (!result.canContinue()) return result;
        }
        return StepResult.ok();
    }
}
