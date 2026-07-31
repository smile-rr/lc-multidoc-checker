package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.types.StageId;

import java.util.Map;
import java.util.Optional;

/**
 * What a stage is allowed to do.
 *
 * <p>An interface with accessors rather than a bag of mutable public fields. The
 * difference is not style: a mutable context has to be carried from stage to stage, which
 * means holding it somewhere between an officer's two clicks, which means holding it in
 * memory, which means the case cannot survive a restart and the service cannot run on two
 * nodes. Reading through here, every stage starts from the database and the blob store
 * and needs nothing handed to it.
 *
 * <p>It is also the whole surface a stage has. There is no way from here to an HTTP
 * client, a JDBC template or a PDF library — those are reached through the ports the
 * implementation was constructed with, and the build fails if a stage imports one
 * directly.
 */
public interface StageContext {

    /** The examination being run. */
    String caseId();

    /** The stage currently executing. */
    StageId stage();

    /** Who asked for it. Recorded against everything the stage does on their behalf. */
    String officerId();

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
    void recordStep(String stepKey, Map<String, Object> result);

    /** Records a step that was answered from cache, with the entry that answered it. */
    void recordCachedStep(String stepKey, Map<String, Object> result, String derivationKey);

    /** Records a step that could not be done, and why. */
    void recordFailedStep(String stepKey, String error);

    /** Reads back an earlier step's result — including one from an earlier stage. */
    Optional<Map<String, Object>> stepResult(StageId stage, String stepKey);

    // --- Progress ------------------------------------------------------------

    /** Tells the browser something happened. Never throws. */
    void emit(HelixEvent event);

    /** Convenience for the common case. */
    default void emit(String type, Map<String, Object> payload) {
        emit(HelixEvent.of(caseId(), type, payload));
    }

    /**
     * Announces a declared step. Called by the runner, not by a stage.
     *
     * <p>Carries the key <em>and</em> the label: the key is the contract a browser can
     * translate on, the label is what it falls back to and what makes the stream readable
     * to whoever is debugging it.
     */
    default void announce(String step, String label) {
        emit(HelixEvent.PROGRESS, Map.of(
                "stage", stage().key(), "step", step, "label", label, "refresh", false));
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
    default void landed(String step, String label) {
        emit(HelixEvent.PROGRESS, Map.of(
                "stage", stage().key(), "step", step, "label", label, "refresh", true));
    }

    // --- Cancellation --------------------------------------------------------

    /**
     * Whether the officer has abandoned this run.
     *
     * <p>Long stages should check between units of work. A run the officer walked away
     * from should stop costing money at the next natural boundary, not at the end.
     */
    boolean cancelled();
}
