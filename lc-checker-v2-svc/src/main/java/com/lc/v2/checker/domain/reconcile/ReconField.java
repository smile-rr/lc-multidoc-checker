package com.lc.v2.checker.domain.reconcile;

import com.lc.v2.checker.domain.common.DocType;
import java.util.Map;

/**
 * Single canonical field in the reconciliation pivot.
 *
 * Two layers of verdict:
 *   <ul>
 *     <li>row-level {@code status} — worst-of all cells (drives lock gate)</li>
 *     <li>per-cell {@code cellStatus} — drives the matrix UI; one entry per
 *         present DocType (LC + each presented doc)</li>
 *   </ul>
 *
 * Backward compat: ComplianceCheckStage continues to read {@code status} +
 * {@code valueByDocType} only — added cell-level fields don't affect it.
 */
public record ReconField(
        String fieldKey,
        String nameEn,
        Map<DocType, Object> valueByDocType,
        Map<DocType, ReconStatus> cellStatus,
        Map<DocType, String> cellDetail,
        ReconStatus status,
        String discrepancyDetail,
        TriageDecision triage
) {
    public enum ReconStatus {
        MATCH,         // value equivalent to LC after normalisation
        DISCREPANCY,   // values present and conflicting
        TOLERANCE,     // values differ but within UCP 30(b) ±10% band
        NA,            // field absent in LC (no reference) OR doesn't apply to doc-type
        MISSING        // expected for this doc-type but not extracted
    }

    /** Convenience constructor for legacy call sites that don't have per-cell data yet. */
    public ReconField(String fieldKey, String nameEn,
                      Map<DocType, Object> valueByDocType,
                      ReconStatus status, String discrepancyDetail, TriageDecision triage) {
        this(fieldKey, nameEn, valueByDocType,
                Map.of(), Map.of(),
                status, discrepancyDetail, triage);
    }
}
