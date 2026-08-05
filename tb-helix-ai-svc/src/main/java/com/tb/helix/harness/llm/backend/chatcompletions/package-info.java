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
 * <p><b>Something that speaks a different shape — or no wire at all — gets its own package
 * beside this one</b> and implements {@link com.tb.helix.harness.llm.backend.ModelBackend}.
 * Anthropic's Messages API is genuinely different ({@code /v1/messages}, content blocks,
 * {@code stop_reason}); an agent framework or an in-process model is different again, and does
 * not speak HTTP at all. None of them changes anything above the backend port: the spend
 * ledger, the vision consensus, the tool budget and the JSON salvage live in
 * {@link com.tb.helix.harness.llm.StandardLlmGateway} and are inherited rather than
 * reimplemented.
 *
 * <p>That is where the vendor-neutrality lives — in the ports, not in this package's name.
 * A package called {@code openai} suggested otherwise, which is why it is gone.
 */
package com.tb.helix.harness.llm.backend.chatcompletions;
