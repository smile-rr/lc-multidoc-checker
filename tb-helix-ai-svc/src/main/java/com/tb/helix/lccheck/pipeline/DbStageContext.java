package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.types.StageId;

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
}
