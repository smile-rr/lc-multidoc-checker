package com.tb.helix.harness.llm.backend.springai;

import org.springframework.ai.anthropic.api.AnthropicApi;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.openai.api.OpenAiApi;

/**
 * The token counts Spring AI's own {@link Usage} does not carry.
 *
 * <p>{@code Usage} promises three numbers — prompt, completion, total — and that is the whole
 * of the abstraction. The figures that actually decide what a run cost, and whether the prefix
 * ordering is working, are not in it: how much input came from the provider's prompt cache, how
 * much was written into it at a premium, and how much of the output was the model thinking.
 * Those live on {@link Usage#getNativeUsage()}, in the provider's own type, spelled differently
 * by each provider.
 *
 * <p><b>So this is the residual wheel, and it is worth being honest about it.</b> Adopting a
 * framework removed the need to write a wire adapter per vendor; it did not remove the need to
 * know what each vendor calls its own numbers, because that is precisely where the abstraction
 * stops. What it did change is the size: roughly twenty lines per provider, in one file, rather
 * than a request builder, a response parser and a retry policy each.
 *
 * <p>Unknown provider types map to zeroes rather than throwing. A backend that cannot read a
 * cache count still made a call that must be recorded — losing the row entirely to protect a
 * breakdown of it would be the worse trade, and {@code promptTokens} and {@code completionTokens}
 * come from the neutral interface either way.
 */
record NativeUsage(int cachedPromptTokens, int cacheWriteTokens, int reasoningTokens,
                   boolean promptCountExcludesCache) {

    static final NativeUsage NONE = new NativeUsage(0, 0, 0, false);

    static NativeUsage of(Usage usage) {
        Object nativeUsage = usage == null ? null : usage.getNativeUsage();
        if (nativeUsage == null) return NONE;

        // OpenAI-shaped: the cache read is nested under prompt_tokens_details and there is no
        // separate write count at all — a write is billed as ordinary input and is already
        // inside prompt_tokens, so zero here is the truth rather than a gap. The cache read
        // is likewise a *part* of prompt_tokens, hence promptCountExcludesCache = false.
        if (nativeUsage instanceof OpenAiApi.Usage u) {
            return new NativeUsage(
                    u.promptTokensDetails() == null ? 0 : or0(u.promptTokensDetails().cachedTokens()),
                    0,
                    u.completionTokenDetails() == null ? 0 : or0(u.completionTokenDetails().reasoningTokens()),
                    false);
        }

        // Anthropic: reads and writes are counted separately, billed differently — the write
        // dearer than ordinary input, the read far cheaper. This is the case the cacheWrite
        // column exists for.
        //
        // And they are counted *beside* input_tokens, not inside it, which is the opposite of
        // the OpenAI shape and the trap this flag exists to disarm. Everything downstream —
        // TokenUsage, the ledger, ModelPrices.costInBandOf — treats prompt tokens as the whole
        // input and derives the fresh part by subtracting the cached parts from it. Handed
        // Anthropic's number unchanged, a call with 20k of cache read and 500 fresh would
        // subtract 20k from 500, clamp at zero, and report a large cached call as very nearly
        // free. The backend adds them back; this flag is how it knows to.
        if (nativeUsage instanceof AnthropicApi.Usage u) {
            return new NativeUsage(
                    or0(u.cacheReadInputTokens()),
                    or0(u.cacheCreationInputTokens()),
                    0,
                    true);
        }

        return NONE;
    }

    /**
     * The whole input, however this provider chose to count it.
     *
     * @param promptTokens what Spring AI's neutral {@code Usage} reported
     */
    int totalPromptTokens(int promptTokens) {
        return promptCountExcludesCache
                ? promptTokens + cachedPromptTokens + cacheWriteTokens
                : promptTokens;
    }

    private static int or0(Integer i) {
        return i == null ? 0 : i;
    }
}
