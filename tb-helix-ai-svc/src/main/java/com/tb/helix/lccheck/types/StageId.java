package com.tb.helix.lccheck.types;

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
 * <p>A type rather than part of the pipeline's contract: a stage name is a noun that appears
 * in a URL, in a database column and in a clear-downstream call, so half the codebase names
 * it. {@code Stage} and {@code StageContext} are the contract and stay in {@code pipeline}
 * with the runner that speaks it. {@code StageOutcome} sits in {@code types.pipeline} —
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

    public static final List<StageId> ORDER = List.of(INTAKE, INTERPRET, GATE, PLAN, EXECUTE, SIGNOFF);

    /**
     * The stages an officer can trigger by name.
     *
     * <p>{@link #GATE} is absent: it is run by asking for {@link #PLAN}. Exposing it
     * would offer the officer a button that means "check whether the credit has expired,
     * but do not plan anything", which is not a thing anyone wants.
     */
    public static final List<StageId> OFFICER_TRIGGERED = List.of(INTERPRET, PLAN, EXECUTE, SIGNOFF);

    public static Optional<StageId> fromKey(String key) {
        return ORDER.stream().filter(s -> s.key.equals(key)).findFirst();
    }

    /** The next stage, or empty at the end of the pipeline. */
    public Optional<StageId> next() {
        int i = ORDER.indexOf(this);
        return i < 0 || i + 1 >= ORDER.size() ? Optional.empty() : Optional.of(ORDER.get(i + 1));
    }

    /**
     * The next stage the officer can actually ask for.
     *
     * <p>Distinct from {@link #next()} because {@link #GATE} is in the pipeline but not on
     * the workbench — it runs when the officer asks for {@link #PLAN}. Parking a case at
     * "waiting for gate" would leave it waiting for a button that does not exist.
     */
    public Optional<StageId> nextOfficerStage() {
        int i = ORDER.indexOf(this);
        for (int j = i + 1; j >= 0 && j < ORDER.size(); j++) {
            if (OFFICER_TRIGGERED.contains(ORDER.get(j))) return Optional.of(ORDER.get(j));
        }
        return Optional.empty();
    }

    /** Stages after this one — what a rerun has to clear. */
    public List<StageId> downstream() {
        return ORDER.subList(Math.min(ORDER.indexOf(this) + 1, ORDER.size()), ORDER.size());
    }
}
