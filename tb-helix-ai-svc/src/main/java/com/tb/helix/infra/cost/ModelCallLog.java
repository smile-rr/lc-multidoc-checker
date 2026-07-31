package com.tb.helix.infra.cost;

import java.util.List;
import java.util.Map;

/**
 * Every attempt on a model, written down.
 *
 * <p>The derivation cache already stored token counts, but a cache row is keyed by content
 * and shared across cases: it can say what an answer cost to produce <em>once</em>, never
 * what this examination spent. A run that was entirely cache hits produced no rows at all,
 * which is why the spend panel had nothing to show for a stage that had plainly done work.
 *
 * <p>So: one row per attempt, including the ones that cost nothing and the ones that failed.
 * A failure costs latency and no tokens and is invisible in a token ledger, and it is
 * exactly the row somebody looking into a slow run wants to find.
 *
 * <p>Never throws. Work that failed because its own accounting failed has been defeated by
 * its bookkeeping — the same rule the event channel follows, for the same reason.
 */
public interface ModelCallLog {

    enum Status { OK, CACHED, FAILED, TIMEOUT }

    enum Kind { TEXT, VISION, TOOL }

    /**
     * One attempt.
     *
     * @param caseId    which examination, when the caller is inside one — null is allowed
     *                  and means the call was made outside a case, not that it did not happen
     * @param slot      which configured slot answered, so two slots on the same model can be
     *                  told apart when one of them is the slow one
     */
    record Call(
            String caseId, String stage, String step,
            String role, String slot, String modelId, String provider,
            Kind kind, Status status, int attempt,
            long promptTokens, long completionTokens, long cachedPromptTokens,
            Integer latencyMs, String derivationKey, String error) {
    }


    /** Writes one attempt down. Never throws — see the class note. */
    void record(Call call);

    /** What one examination spent, grouped by model. Cost is priced at read time. */
    java.util.List<java.util.Map<String, Object>> spendForCase(String caseId);

    /**
     * What every examination has spent over a window.
     *
     * <p>The per-case figure answers "what did this one cost". This answers the question an
     * operations lead has instead: what is this costing us, is it steady per case, and where
     * is it going. Different denominators, so a total is not enough — a total only ever goes
     * up, and cannot say whether anything got better.
     */
    java.util.Map<String, Object> spendSince(java.time.Instant since);
}
