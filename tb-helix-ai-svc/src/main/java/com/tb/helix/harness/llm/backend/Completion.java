package com.tb.helix.harness.llm.backend;

import java.util.List;

/**
 * What one round trip produced.
 *
 * @param text                what the model said, cleaned of code fences and any reasoning
 *                            preamble the provider leaked
 * @param reasoning           what it thought on the way there, where the provider reports it
 *                            in its own field; null where it does not, or where reasoning was
 *                            off. <b>Kept apart from {@code text} on purpose.</b> A model that
 *                            reasons into the content field is the failure
 *                            {@code enable_thinking:false} exists to prevent, so a backend
 *                            must never concatenate the two — and the one call that reasons
 *                            deliberately, the plan's governing call, is also the one whose
 *                            working an officer may have to defend
 * @param toolCalls           tools it wants run before it will answer; empty when it answered
 * @param raw                 the provider's verbatim payload. Kept because when an answer is
 *                            wrong the question is always "what did it actually return", and
 *                            a cleaned string cannot answer it
 * @param cachedPromptTokens  how many of {@code promptTokens} the provider served from its own
 *                            prompt cache, where it reports it; null where it does not. This is
 *                            the only evidence that images-before-instruction is working, so a
 *                            backend that can obtain it and does not is hiding the one number
 *                            that justifies the ordering. Distinct from the derivation cache,
 *                            where no call happens at all — the two must never be added together
 * @param cacheWriteTokens    how many of {@code promptTokens} were written <em>into</em> that
 *                            cache, where a provider bills that separately — Anthropic at
 *                            roughly 1.25× the input rate. Null where the provider has no such
 *                            notion. Reported as ordinary input it under-charges the first call
 *                            of every prefix, which is precisely the call that pays for all the
 *                            later ones
 * @param reasoningTokens     how many of {@code completionTokens} went on thinking rather than
 *                            answering; null where unreported. Billed at the output rate almost
 *                            everywhere, so this moves no total — it is what makes "why did the
 *                            plan cost four times the extraction" an answerable question
 * @param latencyMs           wall clock for this attempt
 */
public record Completion(
        String text,
        String reasoning,
        List<ToolCall> toolCalls,
        String raw,
        Integer promptTokens,
        Integer completionTokens,
        Integer cachedPromptTokens,
        Integer cacheWriteTokens,
        Integer reasoningTokens,
        int latencyMs) {

    public Completion {
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    /** Whether the model asked for tools rather than answering. */
    public boolean wantsTools() {
        return !toolCalls.isEmpty();
    }
}
