package com.tb.helix.harness.llm.backend;

import java.util.List;

/**
 * What one round trip produced.
 *
 * @param text                what the model said, cleaned of code fences and any reasoning
 *                            preamble the provider leaked
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
 * @param latencyMs           wall clock for this attempt
 */
public record Completion(
        String text,
        List<ToolCall> toolCalls,
        String raw,
        Integer promptTokens,
        Integer completionTokens,
        Integer cachedPromptTokens,
        int latencyMs) {

    public Completion {
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    /** Whether the model asked for tools rather than answering. */
    public boolean wantsTools() {
        return !toolCalls.isEmpty();
    }
}
