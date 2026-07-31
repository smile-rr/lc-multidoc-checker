package com.tb.helix.lccheck.types.pipeline;

import java.util.List;
import java.util.Optional;

/**
 * The stages of an examination, in order.
 *
 * <p>Only {@link #INTAKE} runs by itself. Every later stage waits at
 * {@code awaiting_officer} until a person asks for it. That pacing is the product: this
 * is a regulated examination, and a pipeline that ran to completion on upload would be
 * presenting conclusions nobody chose to reach.
 *
 * <p><b>Names, not sequence.</b> Which stage follows which, and which an officer may ask
 * for, live in {@link com.tb.helix.lccheck.pipeline.DocCheckPipeline} — the class called
 * "pipeline" should be the one that tells you the pipeline. This enum used to own both, so
 * the flow could only be learned from an enum of names.
 *
 * <p>A type rather than part of the pipeline's contract: a stage name is a noun that appears
 * in a URL, in a database column and in a clear-downstream call, so half the codebase names
 * it. {@code Stage} and {@code StageContext} are the contract and stay in {@code pipeline}
 * with the runner that speaks it. {@code StepResult} sits in {@code types.pipeline} —
 * pure data, mirroring the behaviour package it serves.
 *
 * <p>{@link #GATE} is a stage in the code and a step on the wire, but it is triggered by
 * the same officer action as {@link #PLAN} — so the workbench keeps three run buttons
 * while the halt gets its own events and its own row in the step tape.
 *
 * <p>Ordering matters: hard checks run before requirement extraction and planning, so an
 * expired credit stops the examination before the expensive half of the run.
 */
public enum StageId {

    /** Accept the upload, convert if needed, digest it, parse the credit. Automatic. */
    INTAKE("intake", true),

    /** Segment the bundle into documents, then read the fields off each. */
    INTERPRET("interpret", false),

    /** Hard checks. A failure ends the examination before anything is planned. */
    GATE("gate", false),

    /** Read this credit's requirements, then select the rules that apply. */
    PLAN("plan", false),

    /** Run them: exact rules against the facts, judged rules through a model. */
    EXECUTE("execute", false),

    /** Aggregate the officer's decisions, generate the advice, route it. */
    SIGNOFF("signoff", false);

    private final String key;
    private final boolean automatic;

    StageId(String key, boolean automatic) {
        this.key = key;
        this.automatic = automatic;
    }

    /** The wire name — what appears in URLs, step rows and events. */
    public String key() {
        return key;
    }

    /** Whether this stage starts without being asked. Only intake does. */
    public boolean automatic() {
        return automatic;
    }

    public static Optional<StageId> fromKey(String key) {
        return java.util.Arrays.stream(values()).filter(s -> s.key.equals(key)).findFirst();
    }
}
