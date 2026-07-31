package com.tb.helix.infra.pipeline;

/**
 * Where the engine reports what it is doing.
 *
 * <p>The port that keeps {@link PipelineEngine} domain-neutral. Announcing a step, writing
 * its outcome down and deciding whether the work has been abandoned are all things a caller
 * does its own way — over server-sent events into a browser, into a table, into a log — and
 * none of them is the engine's business.
 *
 * <p>Implementations must not throw. Work that failed because nobody was listening to its
 * progress has been defeated by its own telemetry.
 */
public interface StepJournal {

    /** A phase is about to run. */
    default void phaseStarted(String phase) {
    }

    /** A phase ended, however it ended. */
    default void phaseFinished(String phase, StepResult result, long elapsedMs) {
    }

    /** A step is about to run. */
    void stepStarted(String phase, String key, String label);

    /** A step finished, however it finished. */
    void stepFinished(String phase, String key, StepResult result, long elapsedMs);

    /** A step declared itself inapplicable. Recorded, never silent. */
    void stepSkipped(String phase, String key, String why);

    /** Whether the work has been abandoned. Checked between steps, never mid-step. */
    default boolean abandoned() {
        return false;
    }

    /**
     * Runs one step's body, giving the journal a chance to wrap it.
     *
     * <p>The engine knows which step is running and nothing about what that means; the
     * caller knows the examination it belongs to. This is the one seam where the two meet,
     * and it exists so a model call made three frames deeper can be attributed to the step
     * that caused it without the request records having to carry a case id.
     *
     * <p>Default is to run it, so a journal that does not care is unaffected.
     */
    default <T> T aroundStep(String phase, String key, java.util.function.Supplier<T> body) {
        return body.get();
    }
}
