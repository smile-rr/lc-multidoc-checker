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
}
