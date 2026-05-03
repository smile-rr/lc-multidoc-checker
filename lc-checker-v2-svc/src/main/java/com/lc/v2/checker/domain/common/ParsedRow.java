package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import java.util.List;
import java.util.Map;

/**
 * Display-ready row of a parsed document. One row per source tag (or envelope block).
 * Backend computes all formatting so the UI renders verbatim.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ParsedRow(
        String tag,
        String group,
        String label,
        String displayValue,
        List<Subline> sublines,
        Map<String, Object> meta,
        String sortKey
) {

    public ParsedRow {
        sublines = sublines == null ? List.of() : List.copyOf(sublines);
        meta = meta == null ? Map.of() : Map.copyOf(meta);
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Subline(String label, String value) {}
}
