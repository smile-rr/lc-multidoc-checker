package com.tb.helix.harness.model;

/**
 * What a text model said.
 *
 * @param content     the message content, already stripped of code fences and any
 *                    reasoning preamble the provider leaked. Callers parse this; they
 *                    should not have to clean it first.
 * @param rawResponse the provider's verbatim payload. Kept because when an answer is
 *                    wrong the question is always "what did it actually return", and a
 *                    cleaned string cannot answer it.
 * @param model       the model that answered — the resolved one, not the requested role
 * @param usage       tokens and latency, for the run's cost record
 */
public record TextResult(
        String content,
        String rawResponse,
        String model,
        TokenUsage usage) {
}
