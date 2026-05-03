package com.lc.v2.checker.api.dto;

import java.util.Map;

/**
 * Officer's final sign-off payload.
 *   decision      = ACCEPT | WAIVER | REFUSE
 *   dispositions  = ruleId → WAIVER | CURED | HOLD | REFUSE | ACCEPT (one per FAIL rule when decision != ACCEPT)
 *   note          = mandatory free-text justification
 *   officerId     = examiner identifier
 */
public record SignoffRequest(
        String decision,
        Map<String, String> dispositions,
        String note,
        String officerId
) {}
