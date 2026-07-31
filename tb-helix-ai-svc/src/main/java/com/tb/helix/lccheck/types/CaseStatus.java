package com.tb.helix.lccheck.types;

import java.util.Optional;

/**
 * Where a case stands, as the officer's list shows it.
 *
 * <p>Distinct from {@link com.tb.helix.lccheck.types.pipeline.StageId}, which says how far
 * through the examination it is. A case can be at the plan stage and be {@code TO_DECIDE},
 * or at the execute stage and be {@code DISCREPANCIES}: one is position, the other is what a
 * person needs to know about it.
 *
 * <p><b>Derived, never independently set.</b> A status is a function of which stage just
 * ended and what it found — so no event moves a case from one to another, and there is no
 * transition table to keep. That is also why this is not a state machine library: those model
 * states you move between on an event, with guards and actions, and we have none. See
 * {@code StageLauncher.statusAfter}, which is the whole of the rule.
 */
public enum CaseStatus {

    /** Waiting for the officer to start the examination. */
    AWAITING_CHECK("awaiting_check"),

    /** A stage is running. */
    RUNNING("running"),

    /** Read, and waiting for the officer to take it further. */
    TO_DECIDE("to_decide"),

    /** Something was found. The officer has grounds to consider. */
    DISCREPANCIES("discrepancies"),

    /** Examined, nothing to raise. */
    CLEAN("clean"),

    /** Signed off and passed on. */
    WITH_AUTHORISER("with_authoriser");

    private final String key;

    CaseStatus(String key) {
        this.key = key;
    }

    /** The value stored in {@code lc_case.status} and shown on the wire. */
    public String key() {
        return key;
    }

    public static Optional<CaseStatus> fromKey(String key) {
        return java.util.Arrays.stream(values()).filter(s -> s.key.equals(key)).findFirst();
    }
}
