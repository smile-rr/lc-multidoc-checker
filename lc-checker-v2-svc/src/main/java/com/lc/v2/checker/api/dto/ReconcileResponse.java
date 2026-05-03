package com.lc.v2.checker.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Reconciliation pivot data + lock state, returned by GET /sessions/{id}/reconcile.
 * The UI uses this to render the canonical-field × document grid plus the lock controls.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReconcileResponse(
        List<ReconRow> fields,
        boolean locked,
        Instant lockedAt,
        String lockedBy,
        Map<String, String> triage  // fieldKey → "genuine" | "parse-error"
) {
    /** One canonical row in the pivot table. */
    public record ReconRow(
            String fieldKey,
            String label,
            String article,                       // UCP/ISBP citation, optional
            String group,                         // Parties / Money / Goods / Shipment & dates / Documentary refs / Other
            Map<String, Object> valueByDocType,   // doc type name → value (string-coerced)
            String verdict,                       // MATCH | DISCREPANCY | TOLERANCE | NA
            String discrepancyDetail
    ) {}
}
