package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Generic field container for all document types in v2.
 *
 * SpEL context exposes raw values via plain maps:
 *   #lc['credit_amount']              → lc envelope value
 *   #docs['BOL']['port_of_loading']   → BOL envelope value
 *
 * Per-field provenance (raw_quote, page, bbox, confidence) lives in a parallel
 * {@code fieldMeta} map, keyed by the same field key. Rules that need to quote
 * verbatim source text reach for {@link #meta(String)}; rules that just compare
 * values keep using {@link #fields()}.
 *
 * Low-confidence or unschematized fields land in {@code extras}.
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public final class FieldEnvelope {

    private final Map<String, Object> fields;
    private final Map<String, Object> extras;
    private final Map<String, FieldValue> fieldMeta;

    private FieldEnvelope(Map<String, Object> fields,
                          Map<String, Object> extras,
                          Map<String, FieldValue> fieldMeta) {
        this.fields = Collections.unmodifiableMap(new LinkedHashMap<>(fields));
        this.extras = Collections.unmodifiableMap(new LinkedHashMap<>(extras));
        this.fieldMeta = Collections.unmodifiableMap(new LinkedHashMap<>(fieldMeta));
    }

    public static FieldEnvelope empty() {
        return new FieldEnvelope(Map.of(), Map.of(), Map.of());
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

    /** Per-field provenance map. Empty when extraction did not supply metadata. */
    public Map<String, FieldValue> fieldMeta() {
        return fieldMeta;
    }

    public Object get(String key) {
        return fields.get(key);
    }

    /** Provenance for a given field key, or {@code null} if not recorded. */
    public FieldValue meta(String key) {
        return fieldMeta.get(key);
    }

    public String rawQuoteOf(String key) {
        FieldValue m = fieldMeta.get(key);
        return m == null ? null : m.rawQuote();
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
        private final Map<String, FieldValue> fieldMeta = new LinkedHashMap<>();

        public Builder put(String key, Object value) {
            if (value != null) fields.put(key, value);
            return this;
        }

        /** Put a value plus its full provenance in one call. */
        public Builder put(String key, FieldValue fv) {
            if (fv == null || fv.value() == null) return this;
            fields.put(key, fv.value());
            fieldMeta.put(key, fv);
            return this;
        }

        public Builder putExtra(String key, Object value) {
            if (value != null) extras.put(key, value);
            return this;
        }

        public Builder putMeta(String key, FieldValue fv) {
            if (fv != null) fieldMeta.put(key, fv);
            return this;
        }

        public Builder putAll(Map<String, Object> map) {
            map.forEach(this::put);
            return this;
        }

        public FieldEnvelope build() {
            return new FieldEnvelope(fields, extras, fieldMeta);
        }
    }
}
