package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.domain.StageId;
import com.tb.helix.infra.stream.HelixEvent;

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

    // --- Cancellation --------------------------------------------------------

    /**
     * Whether the officer has abandoned this run.
     *
     * <p>Long stages should check between units of work. A run the officer walked away
     * from should stop costing money at the next natural boundary, not at the end.
     */
    boolean cancelled();
}
