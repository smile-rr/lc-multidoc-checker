package com.tb.helix.core.error;

/**
 * A document could not be decoded, converted or rendered.
 *
 * <p>422 rather than 500: the request was well-formed and the service is healthy — the
 * file is the problem. That distinction matters operationally, because a corrupt upload
 * that reports as a server error will be chased as an outage.
 */
public class DocumentException extends HelixException {

    private final String code;

    public DocumentException(String message) {
        this(message, "document_unreadable", null);
    }

    public DocumentException(String message, Throwable cause) {
        this(message, "document_unreadable", cause);
    }

    public DocumentException(String message, String code, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    @Override
    public int status() {
        return 422;
    }

    @Override
    public String code() {
        return code;
    }
}
