package com.tb.helix.lccheck.api.dto;

/**
 * An officer's call on one finding.
 *
 * @param disposition agreed — it stands and will be raised;
 *                    parked — they want a second opinion;
 *                    rejected — they override the engine, and it goes back to the model team
 * @param note        why. Optional on agreed, and the most valuable field on rejected.
 */
public record DecisionRequest(String disposition, String note) {
}
