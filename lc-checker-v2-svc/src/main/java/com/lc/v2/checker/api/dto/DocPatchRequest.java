package com.lc.v2.checker.api.dto;

/**
 * PATCH /sessions/{id}/documents/{docId} body.
 * Any field may be null → no change. Used for officer doc-type correction
 * and "Mark reviewed" actions.
 */
public record DocPatchRequest(
        String docType,
        String parseStatus,
        Boolean confirmedByOfficer,
        String officerId
) {}
