package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.types.pipeline.StageId;

import java.util.Map;
import java.util.Optional;

/**
 * A stage's view of the world, read through the database.
 *
 * <p>Nothing is carried between stages in memory. That single property is what makes the
 * service restartable and multi-instance: a stage that begins by reading its inputs from
 * Postgres does not care which process ran the stage before it, or whether that process
 * still exists.
 */
public record DbStageContext(
        String caseId,
        StageId stage,
        String officerId,
        CaseStore store,
        EventBus events,
        Map<String, Boolean> cancelledFlags) implements StageContext {

    @Override
    public void recordStep(String stepKey, Map<String, Object> result) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, false, null);
    }

    @Override
    public void recordCachedStep(String stepKey, Map<String, Object> result, String derivationKey) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, true, derivationKey);
        // Reported, not silent: a run that finishes in four seconds looks broken unless the
        // officer can see it was free.
        emit(HelixEvent.CACHE_HIT, Map.of("stage", stage.key(), "step", stepKey));
    }

    @Override
    public void recordFailedStep(String stepKey, String error) {
        store.recordStep(caseId, stage.key(), stepKey, "FAILED", null, error, false, null);
    }

    @Override
    public Optional<Map<String, Object>> stepResult(StageId from, String stepKey) {
        return store.stepResult(caseId, from.key(), stepKey);
    }

    @Override
    public void emit(HelixEvent event) {
        events.publish(event);
    }

    @Override
    public boolean cancelled() {
        return Boolean.TRUE.equals(cancelledFlags.get(caseId));
    }

    // --- The engine's journal -----------------------------------------------
    //
    // How a step gets announced and written down. The engine calls these; nothing in a
    // stage does, which is why a step cannot be named one thing on the stream and another
    // in the tape.

    @Override
    public void phaseStarted(String phase) {
        events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_STARTED, Map.of("stage", phase)));
    }

    @Override
    public void phaseFinished(String phase, StepResult result, long elapsedMs) {
        // Only a clean finish is announced as done. A halt and a failure each mean something
        // the officer has to be told about specifically, and the runner says it — publishing
        // "done" here as well would put two accounts of the same ending on the wire.
        if (result.status() == StepResult.Status.OK) {
            events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_DONE,
                    Map.of("stage", phase, "ms", elapsedMs)));
        }
    }

    @Override
    public void stepStarted(String phase, String key, String label) {
        announce(key, label);
    }

    @Override
    public void stepFinished(String phase, String key, StepResult result, long elapsedMs) {
        switch (result.status()) {
            case OK, HALTED -> {
                Map<String, Object> data = new java.util.LinkedHashMap<>(result.data());
                data.put("ms", elapsedMs);
                store.recordStep(caseId, phase, key, "OK", data, null, false, null);
                // A note means the case now holds something it did not, so the browser is
                // told to refetch. Only the step knows whether that is warranted; only this
                // publishes.
                if (result.note() != null) landed(key, result.note());
            }
            case SKIPPED -> stepSkipped(phase, key, result.detail());
            case FAILED -> store.recordStep(caseId, phase, key, "FAILED", null, result.detail(), false, null);
        }
    }

    @Override
    public void stepSkipped(String phase, String key, String why) {
        store.recordStep(caseId, phase, key, "NOT_APPLICABLE",
                Map.of("reason", why == null ? "not applicable to this case" : why),
                null, false, null);
    }
}
