package com.tb.helix.lccheck.service;

import com.tb.helix.harness.llm.TokenUsage;
import com.tb.helix.infra.cache.DerivationCache;

/**
 * What a model call cost, on its way into the cache row.
 *
 * <p>The gateway reports usage, the derivation table has columns for it, and the
 * migration that created them called them "for the run's cost record". Every caller in
 * between wrote {@code Entry.of(value)} — the two-argument form that leaves usage null —
 * so a hundred and three cached derivations carried zero tokens between them and the
 * spend panel had nothing to read but a fixture.
 *
 * <p>One translation, in one place, because five call sites each converting the same two
 * records is five chances to record latency as milliseconds in four of them.
 */
public final class ModelSpend {

    private ModelSpend() {
    }

    public static DerivationCache.Usage of(TokenUsage usage) {
        return of(usage, null);
    }

    /** With the model that charged it, so a cache hit can price what it avoided. */
    public static DerivationCache.Usage of(TokenUsage usage, String modelId) {
        if (usage == null) return null;
        return new DerivationCache.Usage(
                usage.promptTokens(), usage.completionTokens(),
                // total() is prompt + completion; TokenUsage does not carry a total of
                // its own, and summing here beats each caller inventing the same sum.
                usage.total(), usage.latencyMs(), modelId);
    }
}
