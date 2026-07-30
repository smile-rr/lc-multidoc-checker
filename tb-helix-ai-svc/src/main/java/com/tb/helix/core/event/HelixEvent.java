package com.tb.helix.core.event;

import java.util.Map;

/**
 * Something worth telling the browser about, while it happens.
 *
 * <p>A run takes minutes. Without progress the officer is looking at a spinner and cannot
 * tell a slow extraction from a hung one, so events are part of the product rather than
 * instrumentation.
 *
 * <p>Deliberately one record with a string {@code type} rather than a sealed hierarchy of
 * event classes. The predecessor had twenty-one record variants, which meant every new
 * thing worth reporting was a change to a shared sealed interface — and the wire format
 * is untyped JSON at the far end regardless. A closed set of constants gives the same
 * discipline where it matters without the ceremony.
 *
 * @param caseId  which examination
 * @param type    see the constants below
 * @param payload type-specific detail, serialised as the event body
 */
public record HelixEvent(String caseId, String type, Map<String, Object> payload) {

    // --- Stage lifecycle ----------------------------------------------------
    public static final String STAGE_STARTED = "stage_started";
    public static final String STAGE_DONE    = "stage_done";
    public static final String STAGE_FAILED  = "stage_failed";

    /** A stage finished and the pipeline is waiting for the officer to start the next. */
    public static final String AWAITING_OFFICER = "awaiting_officer";

    // --- Progress within a stage --------------------------------------------
    /** One more page of the bundle has been identified. {@code {done, total}} */
    public static final String SEGMENT = "segment";

    /** A group of checks has begun / returned. {@code {areaId}} */
    public static final String AREA_STARTED = "area_started";
    public static final String AREA_DONE    = "area_done";

    /** One run step completed — what the UI's three-step progress bar advances on. */
    public static final String STEP_DONE = "step_done";

    /**
     * Work that would have been expensive was answered from cache.
     *
     * <p>Reported rather than silent: a run that finishes in four seconds looks broken
     * unless the officer can see why it was free.
     */
    public static final String CACHE_HIT = "cache_hit";

    // --- Outcomes ------------------------------------------------------------
    /** A hard check failed and the examination stopped. {@code {checkId, statement}} */
    public static final String GATE_HALTED = "gate_halted";

    /** A finding is available. {@code {findingId, severity}} */
    public static final String FINDING = "finding";

    public static HelixEvent of(String caseId, String type) {
        return new HelixEvent(caseId, type, Map.of());
    }

    public static HelixEvent of(String caseId, String type, Map<String, Object> payload) {
        return new HelixEvent(caseId, type, payload == null ? Map.of() : payload);
    }
}
