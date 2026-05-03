package com.lc.v2.checker.api.dto;

/** Officer override on a single rule. */
public record OverrideRequest(
        String newStatus,
        String reason,
        String note,
        boolean flagged,
        String officerId
) {}
