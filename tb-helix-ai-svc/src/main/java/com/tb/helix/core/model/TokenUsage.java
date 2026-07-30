package com.tb.helix.core.model;

/**
 * What one call consumed.
 *
 * <p>Recorded per call and rolled up per run step, so the cost drawer shows measured
 * spend rather than an estimate. {@code cached} is carried here because a cached answer
 * costs nothing and must still appear in the run's shape — a step that reports zero
 * tokens and zero calls looks like a step that did not happen.
 *
 * @param promptTokens     null when the provider does not report usage
 * @param completionTokens null when the provider does not report usage
 * @param latencyMs        wall clock for the call, including retries
 * @param cached           true when this was served from cache and no provider was called
 */
public record TokenUsage(
        Integer promptTokens,
        Integer completionTokens,
        Integer latencyMs,
        boolean cached) {

    public static final TokenUsage FROM_CACHE = new TokenUsage(0, 0, 0, true);

    public int total() {
        return (promptTokens == null ? 0 : promptTokens)
             + (completionTokens == null ? 0 : completionTokens);
    }
}
