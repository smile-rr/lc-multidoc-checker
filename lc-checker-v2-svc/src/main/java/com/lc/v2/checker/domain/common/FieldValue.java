package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Single extracted field value with confidence and raw source text.
 * All SpEL expressions access the {@code value} via #lc['key'] or #docs['INV']['key'].
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldValue(
        Object value,
        Double confidence,
        String raw
) {
    public static FieldValue of(Object value) {
        return new FieldValue(value, null, null);
    }

    public static FieldValue of(Object value, double confidence, String raw) {
        return new FieldValue(value, confidence, raw);
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
}
