package com.tb.helix.lccheck.types.pipeline;

import java.util.Map;

/**
 * What one step of a stage produced.
 *
 * <p>Separate from {@link StageOutcome} because they answer different questions. A step says
 * what it did and hands back what it wrote; a stage says whether the examination can carry
 * on. The runner derives the second from the first, so no stage has to remember to report
 * its own ending.
 *
 * @param status what happened
 * @param data   what the step produced, recorded verbatim on the step tape. This is the
 *               audit record — "the model was asked X and answered Y" — not a return value
 *               the next step reads. A step that needs an earlier step's output reads it
 *               back through {@code StageContext.stepResult}, so a rerun after a restart
 *               works the same as a run that never stopped.
 * @param detail why, for {@link Status#SKIPPED}, {@link Status#HALTED} and
 *               {@link Status#FAILED}. Officer-facing for a halt.
 * @param haltingCheckId which hard check stopped it, when one did
 * @param note   what to tell the officer now that it is done — "Issue of a documentary
 *               credit read", "6 documents read". Its presence is also the signal that the
 *               case changed and the browser should refetch, which is why a step declares it
 *               rather than calling out to the event bus: only the step knows whether what it
 *               wrote is worth a round trip, and the runner is the only thing that should be
 *               publishing.
 */
public record StepResult(Status status, Map<String, Object> data, String detail,
                        String haltingCheckId, String note) {

    public enum Status {
        /** Done. */
        OK,

        /**
         * Not applicable to this case, and that is an answer rather than an omission.
         *
         * <p>An examiner has to be able to say "we did not check that, and here is why".
         * A step that quietly returned without a trace looks identical to one that passed.
         */
        SKIPPED,

        /** A hard check failed and the examination is over. See {@link StageOutcome}. */
        HALTED,

        /** Something broke. Retryable once the cause is addressed. */
        FAILED
    }

    public static StepResult ok() {
        return new StepResult(Status.OK, Map.of(), null, null, null);
    }

    public static StepResult ok(Map<String, Object> data) {
        return new StepResult(Status.OK, data == null ? Map.of() : data, null, null, null);
    }

    /** Done, and worth telling the officer — which also refetches the case. */
    public static StepResult done(String note, Map<String, Object> data) {
        return new StepResult(Status.OK, data == null ? Map.of() : data, null, null, note);
    }

    public static StepResult done(String note) {
        return done(note, Map.of());
    }

    public static StepResult skipped(String why) {
        return new StepResult(Status.SKIPPED, Map.of(), why, null, null);
    }

    public static StepResult halted(String checkId, String detail) {
        return new StepResult(Status.HALTED, Map.of(), detail, checkId, null);
    }

    public static StepResult failed(String detail) {
        return new StepResult(Status.FAILED, Map.of(), detail, null, null);
    }

    public boolean canContinue() {
        return status == Status.OK || status == Status.SKIPPED;
    }

    /** How this step ends the stage it belongs to. */
    public StageOutcome asStageOutcome() {
        return switch (status) {
            case OK, SKIPPED -> StageOutcome.ok();
            case HALTED -> StageOutcome.halted(haltingCheckId, detail);
            case FAILED -> StageOutcome.failed(detail);
        };
    }
}
