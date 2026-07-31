package com.tb.helix.infra.stream;

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
 * <p><b>The wire envelope.</b> Two things every event carries that are not on this record,
 * because only the channel can know them: {@code seq}, its place in the case's order, and
 * {@code at}, when it happened. {@code SseChannel} adds both, to the live stream and to the
 * replayed tape alike, so a panel folding events into stages and steps can measure how long
 * something took without keeping its own clock — and gets the same answer for a run it
 * watched and a run it arrived after.
 *
 * @param caseId  which examination
 * @param type    see the constants below
 * @param payload type-specific detail, serialised as the event body
 */
public record HelixEvent(String caseId, String type, Map<String, Object> payload) {

    // --- Stage lifecycle ----------------------------------------------------
    //
    // A pipeline is made of stages; a stage is made of steps. Both levels report, and the
    // prefix says which level you are looking at. There used to be a STEP_DONE that carried
    // a *stage* key, which is the kind of thing that survives for months because both words
    // sound plausible in a log line.

    public static final String STAGE_STARTED = "stage_started";
    public static final String STAGE_DONE    = "stage_done";
    public static final String STAGE_FAILED  = "stage_failed";

    /** A stage finished and the pipeline is waiting for the officer to start the next. */
    public static final String AWAITING_OFFICER = "awaiting_officer";

    // --- Step lifecycle ------------------------------------------------------
    /**
     * A step began. {@code {stage, step, label}}
     *
     * <p>Finer than {@link #STAGE_STARTED}, and intake is the case that forced it: storing
     * the files, reading the credit and preparing the bundle are seconds apart and each one
     * puts something new on screen, so a stage reporting only its own start and finish would
     * leave the officer looking at an empty workbench for the whole of it.
     */
    public static final String STEP_STARTED = "step_started";

    /**
     * A step finished. {@code {stage, step, label, status, ms, refresh}}
     *
     * <p>Published for <em>every</em> ending — OK, HALTED, SKIPPED, FAILED — which is what
     * {@code status} says. It used to be published only when a step had written something,
     * so a step that announced itself and then went quiet was indistinguishable, to anything
     * watching, from a step still running.
     *
     * <p>{@code refresh} says the case has changed and the browser should refetch — a
     * separate question, answered yes only by a step that produced something. The event says
     * <em>that</em> something landed, never <em>what</em>: one description of a case, the
     * case endpoint, and a progress channel shipping domain objects would be a second weaker
     * copy of it that could drift.
     */
    public static final String STEP_FINISHED = "step_finished";

    /** One more page of the bundle has been identified. {@code {done, total}} */
    public static final String SEGMENT = "segment";

    /** A group of checks has begun / returned. {@code {areaId}} */
    public static final String AREA_STARTED = "area_started";
    public static final String AREA_DONE    = "area_done";


    /**
     * A model was asked something. {@code {stage, step, model, slot, role, kind, status,
     * tokensIn, tokensOut, ms, attempt}}
     *
     * <p>One per attempt on a provider, which is finer than a step: a step can fan out
     * across slots, loop with tools, or retry, and its own timing shows only the sum. Which
     * of three slots was slow, or that a step took ninety seconds because two calls timed
     * out before the third worked, is visible here and nowhere else.
     *
     * <p><b>No cost.</b> Tokens are what the provider returned and never change; cost is
     * tokens times a rate that lives in a price book somebody edits. The tape is
     * append-only, so a cost written here is frozen against a rate that may no longer
     * exist, in a row that can never be corrected — and it would then disagree with the
     * ledger, with no way to tell which is right. Money is priced at read time, from
     * {@code model_call}, where it can be recomputed.
     */
    public static final String LLM_CALL = "llm_call";

    /**
     * A model was <em>not</em> asked, because the answer was already known.
     *
     * <p>Same shape as {@link #LLM_CALL} with {@code status: CACHED}. Reported through the
     * same channel so a reader counting calls sees the ones that did not happen too — a run
     * that made no calls at all and a run whose every call was avoided look identical
     * otherwise, and only one of them is worth being pleased about.
     */
    public static final String LLM_CACHED = "llm_cached";

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
