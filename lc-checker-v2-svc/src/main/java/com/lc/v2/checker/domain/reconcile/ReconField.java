package com.lc.v2.checker.domain.reconcile;

import com.lc.v2.checker.domain.common.DocType;
import java.util.Map;

/**
 * Single canonical field in the reconciliation pivot table.
 * Maps field_key → value per doc type; computes MATCH/DISCREPANCY/TOLERANCE/NA.
 */
public record ReconField(
        String fieldKey,
        String nameEn,
        Map<DocType, Object> valueByDocType,
        ReconStatus status,
        String discrepancyDetail,
        TriageDecision triage
) {
    public enum ReconStatus {
        MATCH,         // all present values are equivalent
        DISCREPANCY,   // values present but conflict
        TOLERANCE,     // values differ but within tolerance band
        NA             // field absent in LC (NOT_APPLICABLE for rules referencing it)
    }
}
