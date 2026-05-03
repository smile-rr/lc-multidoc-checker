package com.lc.v2.checker.domain.lc;

/**
 * Structural contradiction detected within the MT700 itself (Pitfall 06).
 * Shown to officer in Parse stage before extraction begins.
 *
 * Examples:
 *  - Latest shipment date after LC expiry date
 *  - Transhipment prohibited but ports require transhipment
 *  - Full 3/3 B/L required but transhipment prohibited
 */
public record LcConsistencyWarning(
        String code,
        String description,
        String ucpReference
) {
}
