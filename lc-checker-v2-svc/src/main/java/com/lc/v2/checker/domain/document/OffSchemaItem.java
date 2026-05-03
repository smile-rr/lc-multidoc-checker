package com.lc.v2.checker.domain.document;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * VLM-detected physical feature on a document: handwriting, stamps, watermarks, corrections.
 * Stored alongside the field extraction to support rules like BOL-009 (clean B/L) and BC-003 (signed).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OffSchemaItem(
        String kind,           // "handwritten" | "stamp" | "watermark" | "correction"
        String value,
        String fieldHint,      // which canonical field this belongs to, if known
        String location,       // positional hint: "bottom-right", etc.
        String original,       // correction only: original text before correction
        Boolean authenticated, // correction only: was correction initialled/authenticated?
        Integer page,
        Double confidence
) {
}
