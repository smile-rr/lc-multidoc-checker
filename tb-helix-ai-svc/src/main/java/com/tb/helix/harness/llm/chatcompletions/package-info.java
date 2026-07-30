/**
 * The {@code /chat/completions} wire format.
 *
 * <p>Named for the protocol, not for whoever published it first. This package used to be
 * called {@code openai}, which was misleading in a way that matters: it read as though the
 * service had chosen a vendor, when what it has chosen is a wire format that MiniMax,
 * DashScope/Bailian, vLLM, Ollama, Together, Groq and Fireworks all implement. Nothing here
 * calls api.openai.com, and no configuration in this repository points at it.
 *
 * <p>So the one adapter reaches every provider that speaks this shape, and switching between
 * them is a base URL and a key.
 *
 * <p><b>A provider that speaks a different shape gets its own package beside this one.</b>
 * Anthropic's Messages API is genuinely different — {@code /v1/messages}, content blocks,
 * {@code stop_reason} — so it would be {@code harness/llm/messages}, implementing the same
 * {@link com.tb.helix.harness.llm.LlmGateway}. Domain code would not change, because domain
 * code has never seen either: it asks for a role and gets an answer.
 *
 * <p>That is where the vendor-neutrality lives — in the port, not in this package's name.
 * A package called {@code openai} suggested otherwise, which is why it is gone.
 */
package com.tb.helix.harness.llm.chatcompletions;
