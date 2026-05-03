package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Generic field container for all document types in v2.
 *
 * SpEL context exposes these as plain maps:
 *   #lc['credit_amount']              → lc envelope value
 *   #docs['BOL']['port_of_loading']   → BOL envelope value
 *
 * No typed scalar accessors anywhere in v2 — rules read raw values from this map.
 * Low-confidence or unknown fields land in {@code extras}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public final class FieldEnvelope {

    private final Map<String, Object> fields;
    private final Map<String, Object> extras;

    private FieldEnvelope(Map<String, Object> fields, Map<String, Object> extras) {
        this.fields = Collections.unmodifiableMap(new LinkedHashMap<>(fields));
        this.extras = Collections.unmodifiableMap(new LinkedHashMap<>(extras));
    }

    public static FieldEnvelope empty() {
        return new FieldEnvelope(Map.of(), Map.of());
    }

    public static Builder builder() {
        return new Builder();
    }

    /** Direct map access — used by SpEL via #lc and #docs['TYPE']. */
    public Map<String, Object> fields() {
        return fields;
    }

    /** Fields not matched to any canonical key in the field-pool. */
    public Map<String, Object> extras() {
        return extras;
    }

    public Object get(String key) {
        return fields.get(key);
    }

    public String getString(String key) {
        Object v = fields.get(key);
        return v == null ? null : v.toString();
    }

    public boolean has(String key) {
        Object v = fields.get(key);
        return v != null && !v.toString().isBlank();
    }

    public static final class Builder {
        private final Map<String, Object> fields = new LinkedHashMap<>();
        private final Map<String, Object> extras = new LinkedHashMap<>();

        public Builder put(String key, Object value) {
            if (value != null) fields.put(key, value);
            return this;
        }

        public Builder putExtra(String key, Object value) {
            if (value != null) extras.put(key, value);
            return this;
        }

        public Builder putAll(Map<String, Object> map) {
            map.forEach(this::put);
            return this;
        }

        public FieldEnvelope build() {
            return new FieldEnvelope(fields, extras);
        }
    }
}
