package com.tb.helix.infra.pipeline;

import java.util.Map;

/**
 * What one step produced.
 *
 * @param status what happened
 * @param data   what the step produced, journalled verbatim. An audit record — "the model
 *               was asked X and answered Y" — not a return value the next step reads. A step
 *               needing an earlier step's output reads it back from wherever the journal put
 *               it, so a rerun after a restart behaves like a run that never stopped.
 * @param detail why, for {@link Status#SKIPPED}, {@link Status#HALTED} and
 *               {@link Status#FAILED}
 * @param haltKey what stopped it, when something did — a rule id, a policy name
 * @param note   what to tell a person now that it is done. Its presence also means the work
 *               produced something worth re-reading, which is how a caller decides whether a
 *               refresh is warranted; only the step knows that.
 */
public record StepResult(Status status, Map<String, Object> data, String detail,
                         String haltKey, String note) {

    public enum Status {
        /** Done. */
        OK,

        /**
         * Nothing to do here, and that is an answer rather than an omission.
         *
         * <p>Distinct from OK because a caller has to be able to report what was not done.
         * A step that quietly returned looks identical to one that did the work.
         */
        SKIPPED,

        /**
         * A deliberate stop. The remaining steps must not run.
         *
         * <p>Distinct from FAILED because nothing went wrong: the work reached a conclusion
         * and the conclusion is that this cannot continue. Conflating the two reports a
         * correct answer as a system error.
         */
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

    /** Done, and worth telling someone — which also marks the result as worth re-reading. */
    public static StepResult done(String note, Map<String, Object> data) {
        return new StepResult(Status.OK, data == null ? Map.of() : data, null, null, note);
    }

    public static StepResult done(String note) {
        return done(note, Map.of());
    }

    public static StepResult skipped(String why) {
        return new StepResult(Status.SKIPPED, Map.of(), why, null, null);
    }

    public static StepResult halted(String haltKey, String detail) {
        return new StepResult(Status.HALTED, Map.of(), detail, haltKey, null);
    }

    public static StepResult failed(String detail) {
        return new StepResult(Status.FAILED, Map.of(), detail, null, null);
    }

    public boolean canContinue() {
        return status == Status.OK || status == Status.SKIPPED;
    }
}
