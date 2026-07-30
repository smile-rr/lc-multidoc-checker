package com.tb.helix.lccheck.pipeline;

/**
 * One step of an examination.
 *
 * <p>Two methods, deliberately. A stage says which stage it is and does its work;
 * everything else — ordering, officer gating, event emission, retry, persistence — is the
 * orchestrator's, so that adding a stage is adding a class rather than editing five.
 *
 * <p><b>Stages hold no state between calls.</b> Whatever a stage needs it reads through
 * its {@link StageContext}, which reads from the database and the blob store. That is the
 * one rule that makes the service restartable: the predecessor threaded a mutable context
 * object through its pipeline and kept it in a static map, which made every case
 * unresumable after a restart and the whole service unable to run on more than one node.
 *
 * <p>A stage should be idempotent. Rerunning it must produce the same rows rather than a
 * second set — which the step tape's {@code UNIQUE (case, stage, step_key)} enforces for
 * the step records, and a stage's own writes must match.
 */
public interface Stage {

    StageId id();

    /**
     * Does the work.
     *
     * <p>Return {@link StageOutcome#failed} for expected failures — an unreadable PDF, a
     * provider that never answered. Throwing is for programming errors, and the
     * orchestrator will record it as a failure either way; the difference is whether the
     * message is fit for an officer to read.
     */
    StageOutcome execute(StageContext ctx);
}
