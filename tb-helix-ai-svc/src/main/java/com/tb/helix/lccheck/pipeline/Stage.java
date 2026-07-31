package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.types.StageId;

import java.util.List;

/**
 * One phase of an examination.
 *
 * <p>Two methods, and both are declarations: a stage says which stage it is and what steps
 * it is made of. It does not say how to run them — ordering, officer gating, event emission,
 * the step tape, retry and persistence are the orchestrator's, so adding a stage is adding a
 * class rather than editing five.
 *
 * <p><b>Steps are declared, not performed.</b> {@link #steps()} returns the list; the runner
 * walks it. That is what makes the flow readable without reading method bodies, listable over
 * HTTP at {@code /flow}, and impossible to describe differently in two places — the SSE
 * label, the {@code step_key} column and the browser's progress bar now all come from one
 * declaration. Before this there were four descriptions of the same pipeline and none was
 * derived from the others, so they drifted and nothing failed.
 *
 * <p><b>Stages hold no state between calls.</b> Whatever a step needs it reads through its
 * {@link StageContext}, which reads from the database and the blob store. That is the one
 * rule that makes the service restartable: the predecessor threaded a mutable context object
 * through its pipeline and kept it in a static map, which made every case unresumable after
 * a restart and the whole service unable to run on more than one node.
 *
 * <p>A step should be idempotent. Rerunning it must produce the same rows rather than a
 * second set — which the step tape's {@code UNIQUE (case, stage, step_key)} enforces for the
 * step records, and a step's own writes must match.
 */
public interface Stage {

    StageId id();

    /**
     * What this stage does, in order.
     *
     * <p>Called per run rather than cached, so a stage may compose its list from
     * configuration — the catalogue's active checks, the enabled model slots — without the
     * orchestrator knowing. It should not branch on the case: whether a step applies is
     * {@link Step#appliesTo}'s job, so that a skip is recorded with a reason rather than
     * being invisible.
     */
    List<Step> steps();
}
