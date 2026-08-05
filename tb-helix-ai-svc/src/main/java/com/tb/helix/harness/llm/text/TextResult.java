package com.tb.helix.harness.llm.text;

import com.tb.helix.harness.llm.TokenUsage;

/**
 * What a text model said.
 *
 * @param content     the message content, already stripped of code fences and any
 *                    reasoning preamble the provider leaked. Callers parse this; they
 *                    should not have to clean it first.
 * @param reasoning   how it got there, where the provider reports that apart from the
 *                    content; null otherwise. For the governing call in {@code plan} this
 *                    is the working behind a suppression — and a suppression whose
 *                    reasoning nobody can read is the thing that letting a model stand a
 *                    rule down was supposed to avoid.
 * @param rawResponse the provider's verbatim payload. Kept because when an answer is
 *                    wrong the question is always "what did it actually return", and a
 *                    cleaned string cannot answer it.
 * @param model       the model that answered — the resolved one, not the requested role
 * @param usage       tokens and latency, for the run's cost record
 */
public record TextResult(
        String content,
        String reasoning,
        String rawResponse,
        String model,
        TokenUsage usage) {
}
