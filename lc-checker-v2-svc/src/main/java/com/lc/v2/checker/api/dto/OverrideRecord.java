package com.lc.v2.checker.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/** Officer override snapshot — attached to EnrichedRule when v_rule_overrides has a row. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OverrideRecord(
        String newStatus,
        String reason,
        String note,
        boolean flagged,
        Instant createdAt
) {}
