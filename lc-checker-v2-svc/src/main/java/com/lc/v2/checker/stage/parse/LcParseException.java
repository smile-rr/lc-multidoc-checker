package com.lc.v2.checker.stage.parse;

public class LcParseException extends RuntimeException {

    private final String field;

    public LcParseException(String message) {
        super(message);
        this.field = null;
    }

    public LcParseException(String field, String message) {
        super(message);
        this.field = field;
    }

    public LcParseException(String message, Throwable cause) {
        super(message, cause);
        this.field = null;
    }

    public String getField() { return field; }
}
