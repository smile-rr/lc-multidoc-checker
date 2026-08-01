package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.cost.CallScope;
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
    // Steps this stage closed itself. The engine also closes the step it declared,
    // and when a stage records under the engine's own key — `segment` does — both
    // fire and the log shows one step ending twice.
    private final java.util.Set<String> closedByStage = java.util.concurrent.ConcurrentHashMap.newKeySet();

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
        recordStep(stepKey, result, false);
    }

    /**
     * @param refresh whether the browser should refetch the case — true when this
     *                step wrote facts or layout the officer can see without waiting
     *                for the parent fan-out to finish
     */
    public void recordStep(String stepKey, Map<String, Object> result, boolean refresh) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, false, null);
        closedByStage.add(stepKey);
        finished(stepKey, null, "OK", 0, refresh);
    }

    /**
     * Records a step that was answered from cache, with the entry that answered it.
     *
     * <p>Writes the fact down and says nothing on the stream. The cache announces its own
     * hits — {@code llm_cached}, with the model and the tokens the original call reported —
     * and it is the only layer that can, because it is the only one that knows what was
     * avoided. A stage emitting {@code cache_hit} beside it was the same news twice, told
     * less well, from the layer that should know least about how an answer was obtained.
     */
    public void recordCachedStep(String stepKey, Map<String, Object> result, String derivationKey) {
        recordCachedStep(stepKey, result, derivationKey, false);
    }

    public void recordCachedStep(String stepKey, Map<String, Object> result, String derivationKey,
                                 boolean refresh) {
        store.recordStep(caseId, stage.key(), stepKey, "OK", result, null, true, derivationKey);
        closedByStage.add(stepKey);
        finished(stepKey, null, "OK", 0, refresh);
    }

    /** Records a step that could not be done, and why. */
    public void recordFailedStep(String stepKey, String error) {
        store.recordStep(caseId, stage.key(), stepKey, "FAILED", null, error, false, null);
        closedByStage.add(stepKey);
        finished(stepKey, error, "FAILED", 0, false);
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

    // The key announced must be the key recorded. A stage that announced "extract" and
    // then recorded "extract:BOL" put a beginning on the stream that nothing ever ended
    // — six of them per run, each shown as still going until the stage closed. All three
    // stages that announce their own sub-steps did it, which is what a convention nobody
    // states looks like from the inside.

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
        finished(step, label, "OK", 0, true);
    }

    /**
     * The stage already said this step ended; all that is left is the refetch.
     *
     * <p>A step-finished carries two facts — that it ended, and that the case now holds
     * something new. When the stage closed the step itself the first is already on the
     * stream, and repeating it draws the step twice. So this emits a quiet ending: same
     * type (the browser reloads on {@code refresh}), tagged so the run log updates the
     * existing row's label instead of opening a ghost 0&nbsp;ms step.
     */
    private void landedOnly(String step, String note) {
        if (note == null) return;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("stage", stage.key());
        payload.put("step", step);
        payload.put("label", note);
        payload.put("status", "OK");
        payload.put("ms", 0);
        payload.put("refresh", true);
        payload.put("alreadyClosed", true);
        emit(HelixEvent.STEP_FINISHED, payload);
    }

    /**
     * A step ended, however it ended.
     *
     * <p>Published for every ending, not only the ones that changed the case. A step that
     * announced itself and then said nothing more reads, to anything watching, as a step
     * still running — so the progress panel showed work in flight that had finished minutes
     * before, and a skipped step never resolved at all.
     *
     * <p>{@code refresh} is the separate question of whether the browser should refetch, and
     * only a step that wrote something answers yes. Ending and having-produced-something are
     * two facts; conflating them is what left the other endings silent.
     */
    private void finished(String step, String label, String status, long elapsedMs, boolean refresh) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("stage", stage.key());
        payload.put("step", step);
        // Only when there is one. A reader keeps the label the step announced itself
        // with, and an ending that carried the bare key instead would replace
        // "Reading the bill of lading" with "extract:BOL" the moment it finished.
        if (label != null) payload.put("label", label);
        payload.put("status", status);
        payload.put("ms", elapsedMs);
        payload.put("refresh", refresh);
        emit(HelixEvent.STEP_FINISHED, payload);
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

    /**
     * Binds the case, stage and step for the duration of the step.
     *
     * <p>Every model call made anywhere under here is recorded against them, so the spend
     * ledger can answer "which step spent the money" without a request record carrying an
     * examination's vocabulary through the gateway.
     */
    @Override
    public <T> T aroundStep(String phase, String key, java.util.function.Supplier<T> body) {
        return CallScope.bind(CallScope.of(caseId, phase, key), body);
    }

    @Override
    public void stepFinished(String phase, String key, StepResult result, long elapsedMs) {
        switch (result.status()) {
            case OK, HALTED -> {
                Map<String, Object> data = new LinkedHashMap<>(result.data());
                data.put("ms", elapsedMs);
                store.recordStep(caseId, phase, key, "OK", data, null, false, null);
                // A note means the case now holds something it did not, so the browser is
                // told to refetch. Only the step knows whether that is warranted.
                // Unless the stage already closed this key itself. Two endings for one
                // step is two rows in the log for something that happened once.
                if (closedByStage.remove(key)) landedOnly(key, result.note());
                else finished(key, result.note(), result.status().name(), elapsedMs, result.note() != null);
            }
            case SKIPPED -> stepSkipped(phase, key, result.detail());
            case FAILED -> {
                store.recordStep(caseId, phase, key, "FAILED", null, result.detail(), false, null);
                finished(key, result.detail(), "FAILED", elapsedMs, false);
            }
        }
    }

    /**
     * A step that did not run, recorded and reported in one place.
     *
     * <p>The engine reaches this two ways — a step whose preconditions were not met, which
     * never announced itself, and a step that ran and declared itself inapplicable. Only the
     * second has a beginning on the stream, so the ending stands alone and a reader takes it
     * for a step that took no time. Which is what happened.
     */
    @Override
    public void stepSkipped(String phase, String key, String why) {
        String reason = why == null ? "nothing for this step to do" : why;
        store.recordStep(caseId, phase, key, "NOT_APPLICABLE", Map.of("reason", reason),
                null, false, null);
        finished(key, reason, "SKIPPED", 0, false);
    }
}
