package com.tb.helix.harness.llm.text;

import com.tb.helix.harness.llm.LlmRole;

import java.util.Map;
import java.util.Objects;

/**
 * One question for a text model.
 *
 * @param role         which role answers it; configuration decides the slot
 * @param system       the persona and the output contract
 * @param user         the question
 * @param jsonOutput   ask the provider to constrain the response to JSON. A hint, not a
 *                     guarantee — the caller still validates, because a model that has
 *                     been told to emit JSON still occasionally wraps it in prose.
 * @param maxTokens    null uses the slot's configured ceiling
 * @param overrides    per-call additions to the request body, merged over the slot's
 *                     {@code extraBody}. Rare; a rule that needs reasoning turned on for
 *                     one call is the case this exists for.
 */
public record TextRequest(
        LlmRole role,
        String system,
        String user,
        boolean jsonOutput,
        Integer maxTokens,
        Map<String, Object> overrides) {

    public TextRequest {
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(user, "user");
        overrides = overrides == null ? Map.of() : Map.copyOf(overrides);
    }

    public static TextRequest of(LlmRole role, String system, String user) {
        return new TextRequest(role, system, user, false, null, Map.of());
    }

    public static TextRequest json(LlmRole role, String system, String user) {
        return new TextRequest(role, system, user, true, null, Map.of());
    }

    /**
     * JSON, with the model's reasoning turned on for this one call.
     *
     * <p>Every slot ships {@code enable_thinking: false} because a Qwen3-family model that
     * thinks aloud leaks the reasoning into the structured output. The override merges after
     * the slot's own {@code extraBody}, so this wins — and {@code LlmText.extractJson} is
     * what makes it safe, lifting the JSON back out of whatever the model wrapped it in.
     *
     * <p>For the call that has to weigh one thing against another rather than transcribe.
     * It is slower and it costs more, so it is asked for by name rather than configured on.
     */
    public static TextRequest thinking(LlmRole role, String system, String user) {
        return new TextRequest(role, system, user, true, null, Map.of("enable_thinking", true));
    }
}
