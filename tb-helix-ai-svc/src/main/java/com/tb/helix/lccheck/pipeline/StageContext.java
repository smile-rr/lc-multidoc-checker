package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.pipeline.StepJournal;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.types.pipeline.StageId;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * What a stage is allowed to do, and how it is done.
 *
 * <p>Everything here goes to Postgres and to the browser. Nothing is carried between stages
 * in memory, and that single property is what makes the service restartable and
 * multi-instance: a stage that begins by reading its inputs from the database does not care
 * which process ran the stage before it, or whether that process still exists. It is why
 * this is not the mutable public-field bag its predecessor kept in a static map.
 *
 * <p>A class rather than an interface with one implementation behind it. The interface was
 * described as narrowing what a stage can reach, but every stage is constructed with the
 * {@link CaseStore} anyway, so it narrowed nothing — two files to say what the private
 * fields below already say. The methods are the surface; {@code store} and {@code events}
 * are not reachable through it.
 */
public final class StageContext implements StepJournal {

    private final String caseId;
    private final StageId stage;
    private final String officerId;
    private final CaseStore store;
    private final EventBus events;
    private final Map<String, Boolean> cancelledFlags;

    public StageContext(String caseId, StageId stage, String officerId,
                        CaseStore store, EventBus events, Map<String, Boolean> cancelledFlags) {
        this.caseId = caseId;
        this.stage = stage;
        this.officerId = officerId;
        this.store = store;
        this.events = events;
        this.cancelledFlags = cancelledFlags;
    }

    /** The examination being run. */
    public String caseId() {
        return caseId;
    }

    /** The stage currently executing. */
    public StageId stage() {
        return stage;
    }

    /** Who asked for it. Recorded against everything the stage does on their behalf. */
    public String officerId() {
        return officerId;
    }

    // --- Recording work ------------------------------------------------------

    /**
     * Records a unit of work.
     *
     * <p>Idempotent on {@code (case, stage, stepKey)}: rerunning updates rather than
     * duplicating, which is what makes a retry safe.
     *
     * @param stepKey conventional, e.g. {@code extract:INV} or {@code convert}
     * @param result  whatever the step produced, stored as JSON. This is the tape for
     *                anything that is read back whole rather than filtered — a stage that
     *                needs its output queried should be writing to a table instead.
     */
    public void recordStep(String stepKey, Map<String, Object> result) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, false, null);
    }

    /** Records a step that was answered from cache, with the entry that answered it. */
    public void recordCachedStep(String stepKey, Map<String, Object> result, String derivationKey) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, true, derivationKey);
        // Reported, not silent: a run that finishes in four seconds looks broken unless the
        // officer can see it was free.
        emit(HelixEvent.CACHE_HIT, Map.of("stage", stage.key(), "step", stepKey));
    }

    /** Records a step that could not be done, and why. */
    public void recordFailedStep(String stepKey, String error) {
        store.recordStep(caseId, stage.key(), stepKey, "FAILED", null, error, false, null);
    }

    /** Reads back an earlier step's result — including one from an earlier stage. */
    public Optional<Map<String, Object>> stepResult(StageId from, String stepKey) {
        return store.stepResult(caseId, from.key(), stepKey);
    }

    // --- Progress ------------------------------------------------------------

    /** Tells the browser something happened. Never throws. */
    public void emit(HelixEvent event) {
        events.publish(event);
    }

    /** Convenience for the common case. */
    public void emit(String type, Map<String, Object> payload) {
        emit(HelixEvent.of(caseId, type, payload));
    }

    /**
     * Announces a declared step. Called by the engine, not by a stage.
     *
     * <p>Carries the key <em>and</em> the label: the key is the contract a browser can
     * translate on, the label is what it falls back to and what makes the stream readable
     * to whoever is debugging it.
     */
    public void announce(String step, String label) {
        emit(HelixEvent.STEP_STARTED, Map.of(
                "stage", stage.key(), "step", step, "label", label));
    }

    /**
     * Says the case now holds something it did not a moment ago, so the browser should
     * refetch.
     *
     * <p>The event says <em>that</em> something landed, never <em>what</em> — there is one
     * description of a case, the case endpoint, and a progress channel that shipped domain
     * objects would be a second weaker copy of it that could drift.
     *
     * <p>This one a step does call, because only the step knows whether what it wrote is
     * worth a round trip. Reading the credit is; counting pages is not, on its own.
     */
    public void landed(String step, String label) {
        emit(HelixEvent.STEP_FINISHED, Map.of(
                "stage", stage.key(), "step", step, "label", label, "refresh", true));
    }

    // --- Cancellation --------------------------------------------------------

    /**
     * Whether the officer has abandoned this run.
     *
     * <p>The engine checks it between steps; a long step should check it between units of
     * its own work. A run the officer walked away from should stop costing money at the next
     * natural boundary, not at the end.
     *
     * <p>Named {@code cancelled} here and {@code abandoned} on the journal because the two
     * words belong to different readers — an officer cancels, an engine sees work abandoned.
     */
    public boolean cancelled() {
        return Boolean.TRUE.equals(cancelledFlags.get(caseId));
    }

    @Override
    public boolean abandoned() {
        return cancelled();
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
        // the officer has to be told about specifically, and the launcher says it — publishing
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
                Map<String, Object> data = new LinkedHashMap<>(result.data());
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
