package com.tb.helix.infra.error;

/**
 * Something the caller can be told about.
 *
 * <p>The base of the small set of typed failures this service raises deliberately, as
 * opposed to the unchecked ones that mean a bug. Each subtype maps to an HTTP status in
 * one place, so a controller never translates an exception and no two controllers
 * translate the same one differently.
 *
 * <p>Messages here are read by an officer. "Could not decode page 3 of the bundle" is one;
 * a stack trace with a provider's error code in it is not.
 */
public abstract class HelixException extends RuntimeException {

    protected HelixException(String message) {
        super(message);
    }

    protected HelixException(String message, Throwable cause) {
        super(message, cause);
    }

    /** The HTTP status this failure means. */
    public abstract int status();

    /** A stable machine-readable code, for a client that wants to branch on the kind. */
    public abstract String code();
}
