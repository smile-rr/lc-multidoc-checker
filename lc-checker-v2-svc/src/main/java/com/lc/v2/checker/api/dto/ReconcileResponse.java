package com.lc.v2.checker.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Reconciliation matrix + lock state, returned by GET /sessions/{id}/reconcile.
 *
 * <p>UI renders a canonical-field × document matrix. The LC column is the
 * frozen reference (read-only); each other column is a presented document
 * with per-cell verdict and an optional officer decision.</p>
 *
 * <p>Legacy {@code triage} map retained for backward compatibility — it is a
 * derived view of {@code cellDecisions} (a row is "triaged" when all its
 * non-MATCH cells have decisions).</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReconcileResponse(
        List<ReconRow> fields,
        boolean locked,
        Instant lockedAt,
        String lockedBy,
        Map<String, String> triage,                    // legacy row-level
        List<CellDecision> cellDecisions               // current per-cell decisions
) {

    public record ReconRow(
            String fieldKey,
            String label,
            String article,                            // UCP/ISBP citation, optional
            String group,                              // IDENTITY/MONEY/GOODS/...
            String fieldType,                          // STRING/AMOUNT/DATE/etc — UI hints
            Map<String, Object> valueByDocType,        // legacy flat map
            Map<String, ReconCell> cells,              // doc-type → cell
            String verdict,                            // worst-of cells
            String discrepancyDetail
    ) {}

    /**
     * Per-cell render data.
     *   verdict: MATCH | TOLERANCE | DISCREPANCY | NA | MISSING
     *   detail:  "−1.76% vs LC", "expected per LC, not extracted", etc.
     *   slotResults: per-vision-slot raw values (only included for non-LC
     *                cells when multiple vision slots ran).
     */
    public record ReconCell(
            Object value,
            String verdict,
            String detail,
            Map<String, Object> slotResults
    ) {}

    /**
     * Officer decision for a single cell.
     *   decision: parse_error | genuine | accept_match | edited
     *   note:     required for accept_match (audit reason)
     */
    public record CellDecision(
            String fieldKey,
            String docType,
            String decision,
            String note,
            String officerId,
            Instant decidedAt
    ) {}
}
