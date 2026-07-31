package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.pipeline.StepPhase;
import com.tb.helix.lccheck.types.pipeline.StageId;

import java.util.List;

/**
 * One phase of an examination.
 *
 * <p>A {@link StepPhase} that knows which stage of a documentary-credit examination it is.
 * That is the whole of what this adds: the engine runs steps, and this says the steps belong
 * to intake, or interpret, or the gate.
 *
 * <p><b>Steps are declared, not performed.</b> {@link #steps()} returns the list;
 * {@link com.tb.helix.infra.pipeline.PipelineEngine} walks it. That is what makes the flow
 * readable without reading method bodies, listable over HTTP at {@code /flow}, and impossible
 * to describe differently in two places — the label on the stream, the {@code step_key}
 * column and the browser's progress all come from one declaration. Before this there were
 * four descriptions of the same pipeline and none derived from the others, so they drifted
 * and nothing failed.
 *
 * <p><b>Stages hold no state between calls.</b> Whatever a step needs it reads through its
 * {@link StageContext}, which reads from the database and the blob store. That is the one
 * rule that makes the service restartable: the predecessor threaded a mutable context object
 * through its pipeline and kept it in a static map, which made every case unresumable after a
 * restart and the whole service unable to run on more than one node.
 *
 * <p>A step should be idempotent. Rerunning it must produce the same rows rather than a
 * second set — which the step tape's {@code UNIQUE (case, stage, step_key)} enforces for the
 * step records, and a step's own writes must match.
 */
public interface Stage extends StepPhase<StageContext> {

    StageId id();

    /** The phase key is the stage key. Two names for one thing would be one too many. */
    @Override
    default String key() {
        return id().key();
    }

    @Override
    List<Step<StageContext>> steps();
}
