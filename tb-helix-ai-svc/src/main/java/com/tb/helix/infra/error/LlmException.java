package com.tb.helix.infra.error;

/**
 * Every slot for a role failed.
 *
 * <p>502, because the failure is upstream. Raised only when nothing usable came back at
 * all — a single slot failing within a multi-slot read is dropped and recorded, not
 * thrown, because redundancy is the reason for having more than one.
 *
 * <p>This must never be swallowed into a passing verdict. A rule that concludes "no
 * discrepancy" because the model was unreachable is the most dangerous outcome the
 * service can produce, and it is indistinguishable from a real pass unless this
 * propagates.
 */
public class LlmException extends HelixException {

    private final LlmRoleFailure failure;

    /** Which role could not be served, and what the slots said. */
    public record LlmRoleFailure(String role, java.util.List<String> slotErrors) {
    }

    public LlmException(String message, LlmRoleFailure failure) {
        super(message);
        this.failure = failure;
    }

    public LlmException(String message, LlmRoleFailure failure, Throwable cause) {
        super(message, cause);
        this.failure = failure;
    }

    public LlmRoleFailure failure() {
        return failure;
    }

    @Override
    public int status() {
        return 502;
    }

    @Override
    public String code() {
        return "model_unavailable";
    }
}
