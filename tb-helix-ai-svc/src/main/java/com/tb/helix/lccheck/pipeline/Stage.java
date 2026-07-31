package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.pipeline.StepPhase;
import com.tb.helix.lccheck.types.pipeline.StageId;

/**
 * A phase of a document examination.
 *
 * <p>Everything a stage does is inherited: it is a {@link StepPhase} of declared steps that
 * {@link com.tb.helix.infra.pipeline.PipelineEngine} walks. All this adds is a typed
 * {@link StageId} in place of the engine's untyped key, because the rest of lc-check
 * switches on stages and a string would put that safety back on the caller.
 *
 * <p>See {@code package-info} for how the pieces fit, and {@link DocCheckPipeline} for the
 * flow they make up.
 */
public interface Stage extends StepPhase<StageContext> {

    StageId id();

    @Override
    default String key() {
        return id().key();
    }
}
