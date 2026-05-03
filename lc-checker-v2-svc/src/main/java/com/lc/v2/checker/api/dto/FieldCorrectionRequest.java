package com.lc.v2.checker.api.dto;

/**
 * Officer correction of a single extracted field value.
 *   issueKind = "model" | "doc" | "other" — drives downstream routing
 *      "model" → flag-agent-error → model-quality queue (POC: just emits SSE event)
 *      "doc"   → ops review log (page is unclear)
 *      "other" → audit-only (cosmetic / normalisation)
 */
public record FieldCorrectionRequest(
        String value,
        String issueKind,
        String note,
        String officerId
) {}
