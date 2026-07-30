package com.tb.helix.core.error;

/**
 * The request was valid but the thing is not in a state to accept it.
 *
 * <p>409, and it is the officer-pacing status: running a stage the case is not waiting
 * for, rerunning a stage of a case already signed off, editing a check someone else is
 * holding open.
 *
 * <p>The message should say what state the thing is actually in. "Cannot run execute"
 * leaves the officer guessing; "this case is waiting at interpret" tells them what to
 * press.
 */
public class ConflictException extends HelixException {

    private final String code;

    public ConflictException(String message) {
        this(message, "conflict");
    }

    public ConflictException(String message, String code) {
        super(message);
        this.code = code;
    }

    @Override
    public int status() {
        return 409;
    }

    @Override
    public String code() {
        return code;
    }
}
