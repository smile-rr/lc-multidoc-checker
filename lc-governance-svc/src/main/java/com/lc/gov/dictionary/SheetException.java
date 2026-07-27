package com.lc.gov.dictionary;

import java.util.List;

/**
 * A rejected upload, carrying every problem found rather than the first.
 *
 * <p>Row-level errors are collected across the whole sheet and returned
 * together: fixing a 200-row spreadsheet one error per round trip is not a
 * workflow anyone will use twice.
 */
public class SheetException extends RuntimeException {

    private final List<String> errors;

    public SheetException(String message, List<String> errors) {
        super(message);
        this.errors = List.copyOf(errors);
    }

    public SheetException(String message) {
        this(message, List.of());
    }

    public List<String> getErrors() {
        return errors;
    }
}
