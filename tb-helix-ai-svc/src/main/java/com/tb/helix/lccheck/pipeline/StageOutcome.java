package com.tb.helix.lccheck.pipeline;

/**
 * How a stage ended.
 *
 * <p>Three outcomes, and the middle one is the reason this is not a boolean.
 *
 * @param status  what happened
 * @param detail  why, for {@link Status#HALTED} and {@link Status#FAILED}. Officer-facing
 *                for a halt — it becomes the ground stated in the refusal advice.
 * @param haltingCheckId which hard check stopped it, when one did
 */
public record StageOutcome(Status status, String detail, String haltingCheckId) {

    public enum Status {
        /** The stage did its work. The pipeline waits for the officer. */
        OK,

        /**
         * A hard check failed and the examination is over.
         *
         * <p>Distinct from FAILED because nothing went wrong: the system did exactly what
         * it was asked to and the answer is that this presentation cannot be accepted.
         * Conflating the two would have an expired credit reported as a system error.
         */
        HALTED,

        /** Something broke. The stage can be retried once the cause is addressed. */
        FAILED
    }

    public static StageOutcome ok() {
        return new StageOutcome(Status.OK, null, null);
    }

    public static StageOutcome halted(String checkId, String detail) {
        return new StageOutcome(Status.HALTED, detail, checkId);
    }

    public static StageOutcome failed(String detail) {
        return new StageOutcome(Status.FAILED, detail, null);
    }

    public boolean canContinue() {
        return status == Status.OK;
    }
}
