package com.tb.helix.harness.llm.vision;

import com.tb.helix.harness.llm.TokenUsage;

import java.util.List;
import java.util.Map;

/**
 * What the models read off the pages, after reconciliation.
 *
 * <p>When a role maps to several slots they run in parallel and vote field by field. The
 * consensus is here; {@link #slotResults} keeps what each slot actually said, because
 * "the models disagreed" is the single most useful thing to know about a doubtful field
 * and it is lost the moment only the winner is kept.
 *
 * @param fields       the agreed value per field key
 * @param confidence   per-field confidence for the agreed value
 * @param quotes       per-field raw text the value was read from — the provenance an
 *                     officer needs to check a value without re-reading the page
 * @param offSchema    values the model found that no field asked for. Surfaced rather
 *                     than dropped: a document carrying something unexpected is exactly
 *                     the case worth a human's attention.
 * @param slotResults  what each slot said, in slot order
 * @param usage        summed across slots
 */
public record VisionResult(
        Map<String, Object> fields,
        Map<String, Confidence> confidence,
        Map<String, String> quotes,
        List<Map<String, Object>> offSchema,
        List<SlotResult> slotResults,
        TokenUsage usage) {

    /** How much to trust a value. */
    public enum Confidence {
        HIGH, MED, LOW
    }

    /**
     * One slot's answer, kept whole.
     *
     * @param failed true when the slot errored or timed out. A failed slot does not fail
     *               the read — redundancy is why there is more than one — but it must be
     *               visible, or a three-slot consensus silently becomes a one-slot guess.
     */
    public record SlotResult(
            String slot,
            String model,
            Map<String, Object> fields,
            String rawResponse,
            boolean failed,
            String error,
            TokenUsage usage) {
    }

    public boolean isEmpty() {
        return fields == null || fields.isEmpty();
    }
}
