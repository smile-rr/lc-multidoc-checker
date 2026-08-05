package com.tb.helix.harness.llm;

/**
 * What one call consumed.
 *
 * <p>Recorded per call and rolled up per run step, so the cost drawer shows measured
 * spend rather than an estimate. {@code cached} is carried here because a cached answer
 * costs nothing and must still appear in the run's shape — a step that reports zero
 * tokens and zero calls looks like a step that did not happen.
 *
 * <p><b>Four token counts, because they are billed at four rates.</b> Input splits three
 * ways once a provider has a prompt cache — fresh input, input served from that cache
 * (roughly a tenth of the rate), and input <em>written</em> into it (Anthropic charges
 * about 1.25×). Output splits two ways once a model reasons. Carrying one input number and
 * one output number meant the first call of every prefix was under-reported and the reason
 * a governing call cost four times an extraction was unanswerable.
 *
 * <p><b>{@code cached} is a different thing from {@code cachedPromptTokens} and they must
 * never be added together.</b> The first means the derivation cache answered and no
 * provider was called at all, so nothing was billed. The second means a provider answered
 * and billed us at its cache rate. Both get called "cache" in conversation.
 *
 * @param promptTokens        total input, inclusive of the cached and cache-written parts —
 *                            it is what the provider reports as {@code prompt_tokens} and is
 *                            not a sum to be recomputed. Null when usage is not reported
 * @param completionTokens    total output, inclusive of {@code reasoningTokens}. Null when
 *                            usage is not reported
 * @param cachedPromptTokens  how much of {@code promptTokens} was served from the provider's
 *                            prompt cache. Zero, not null, where a provider has no cache —
 *                            the absence of a cache and a cache that missed are both "nothing
 *                            was served cheaply"
 * @param cacheWriteTokens    how much of {@code promptTokens} was written into that cache,
 *                            where the provider bills it separately. Zero elsewhere
 * @param reasoningTokens     how much of {@code completionTokens} was the model thinking
 *                            rather than answering. Zero when reasoning was off or unreported
 * @param latencyMs           wall clock for the call, including retries
 * @param cached              true when this was served from the derivation cache and no
 *                            provider was called
 */
public record TokenUsage(
        Integer promptTokens,
        Integer completionTokens,
        Integer cachedPromptTokens,
        Integer cacheWriteTokens,
        Integer reasoningTokens,
        Integer latencyMs,
        boolean cached) {

    /** Nothing was spent because nothing was called. */
    public static final TokenUsage FROM_CACHE = new TokenUsage(0, 0, 0, 0, 0, 0, true);

    /**
     * An attempt that reported nothing — a failure, or a provider that omits usage.
     *
     * @param latencyMs a failure still costs wall clock, and that is the figure a slow-run
     *                  investigation is looking for
     */
    public static TokenUsage none(Integer latencyMs) {
        return new TokenUsage(0, 0, 0, 0, 0, latencyMs, false);
    }

    /** A call whose provider reports only the two headline counts. */
    public static TokenUsage of(Integer promptTokens, Integer completionTokens, Integer latencyMs) {
        return new TokenUsage(promptTokens, completionTokens, 0, 0, 0, latencyMs, false);
    }

    /** Input plus output. Not billed at one rate — see the class note — but the run's size. */
    public int total() {
        return or0(promptTokens) + or0(completionTokens);
    }

    /** Input the provider had to read afresh: everything it did not serve from its cache. */
    public int freshPromptTokens() {
        return Math.max(0, or0(promptTokens) - or0(cachedPromptTokens));
    }

    private static int or0(Integer i) {
        return i == null ? 0 : i;
    }
}
