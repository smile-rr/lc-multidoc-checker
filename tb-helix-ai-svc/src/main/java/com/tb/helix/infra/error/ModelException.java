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
public class ModelException extends HelixException {

    private final ModelRoleFailure failure;

    /** Which role could not be served, and what the slots said. */
    public record ModelRoleFailure(String role, java.util.List<String> slotErrors) {
    }

    public ModelException(String message, ModelRoleFailure failure) {
        super(message);
        this.failure = failure;
    }

    public ModelException(String message, ModelRoleFailure failure, Throwable cause) {
        super(message, cause);
        this.failure = failure;
    }

    public ModelRoleFailure failure() {
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
