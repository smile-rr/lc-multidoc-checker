package com.lc.v2.checker.api.dto;

/** Officer triage of a discrepancy/tolerance row in the reconcile pivot. */
public record TriageRequest(
        String fieldKey,
        String decision,   // "genuine" | "parse-error"
        String officerId
) {}
