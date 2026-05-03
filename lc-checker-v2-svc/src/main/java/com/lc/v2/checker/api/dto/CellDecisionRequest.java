package com.lc.v2.checker.api.dto;

/**
 * POST /sessions/{id}/reconcile/cell-decision body.
 *
 *   decision: parse_error | genuine | accept_match | edited
 *   note: required for accept_match
 */
public record CellDecisionRequest(
        String fieldKey,
        String docType,
        String decision,
        String note,
        String officerId
) {}
