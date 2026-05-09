package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Single extracted field value with provenance.
 * <p>
 * SpEL expressions read the {@code value} via {@code #lc['key']} or
 * {@code #docs['INV']['key']}, which goes through {@link FieldEnvelope#fields()}
 * (raw map). Provenance metadata (rawQuote / page / bbox / confidence) lives
 * here and is reachable via {@code FieldEnvelope.meta(key)}; rules that need
 * to quote evidence to the officer use that path.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldValue(
        Object value,
        Double confidence,
        String rawQuote,
        Integer page,
        BBox bbox
) {
    public static FieldValue of(Object value) {
        return new FieldValue(value, null, null, null, null);
    }

    public static FieldValue of(Object value, double confidence, String rawQuote) {
        return new FieldValue(value, confidence, rawQuote, null, null);
    }

    public static FieldValue of(Object value, Double confidence, String rawQuote) {
        return new FieldValue(value, confidence, rawQuote, null, null);
    }

    public static FieldValue of(Object value, double confidence, String rawQuote, Integer page, BBox bbox) {
        return new FieldValue(value, confidence, rawQuote, page, bbox);
    }

    public boolean isPresent() {
        return value != null && !value.toString().isBlank();
    }

    public String asString() {
        return value == null ? null : value.toString();
    }

    public boolean asBoolean() {
        if (value == null) return false;
        String s = value.toString().trim().toLowerCase();
        return "true".equals(s) || "1".equals(s) || "yes".equals(s);
    }

    /** Backward-compat accessor — old name was {@code raw()}. */
    public String raw() {
        return rawQuote;
    }
}
