package com.tb.helix.harness.llm;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code helix.models.*} and {@code helix.roles.*}
 *
 * <p>Nothing here names a vendor. Slots are numbered and uniform, and provider quirks
 * travel as {@code extraBody} — {@code enable_thinking: false} is a fact about one model
 * family, and teaching this type about it would make every future family a code change.
 *
 * <p>Roles are the indirection that matters. Domain code asks for {@link LlmRole#EXTRACT};
 * configuration decides that means {@code vlm-1}, or {@code vlm-1} and {@code vlm-2}
 * voting. Swapping provider, model or consensus width never reaches a stage.
 */
@ConfigurationProperties(prefix = "helix")
public record LlmProperties(Models models, Map<String, List<String>> roles) {

    public LlmProperties {
        models = models == null ? new Models(Map.of(), Map.of()) : models;
        roles = roles == null ? Map.of() : Map.copyOf(roles);
    }

    public record Models(Map<String, Slot> text, Map<String, Slot> vision) {
        public Models {
            text = text == null ? Map.of() : Map.copyOf(text);
            vision = vision == null ? Map.of() : Map.copyOf(vision);
        }
    }

    /** What {@link Slot#backend()} means when a slot does not say. */
    public static final String DEFAULT_BACKEND = "chat-completions";

    /**
     * One provider endpoint.
     *
     * @param backend     which {@code ModelBackend} owns this slot, by its {@code name()}.
     *                    Defaults to {@value #DEFAULT_BACKEND}, so every slot written before
     *                    there was a second backend keeps the one it always had. <b>A slot
     *                    belongs to exactly one backend</b> — backends claim by this field
     *                    rather than by "can I handle this?", because two backends both able
     *                    to serve an OpenAI-shaped endpoint would otherwise both claim it and
     *                    which one answered would come down to bean order.
     * @param provider    which model implementation the named backend should build for this
     *                    slot — {@code openai} or {@code anthropic} for the Spring AI backend.
     *                    Ignored by {@code chat-completions}, which speaks one wire format by
     *                    definition.
     * @param temperature zero for anything cacheable, always. A cached answer from a
     *                    sampling call is a lie about repeatability, and the cache cannot
     *                    tell the difference.
     * @param maxRetries  retries on transport failure and 5xx only. A 400 means the request
     *                    is wrong and will be wrong again.
     * @param extraBody   merged into the request body verbatim. The escape hatch that keeps
     *                    provider quirks out of the abstraction.
     */
    public record Slot(
            boolean enabled,
            String backend,
            String provider,
            String baseUrl,
            String apiKey,
            String model,
            Double temperature,
            Integer maxTokens,
            Duration connectTimeout,
            Duration readTimeout,
            int maxRetries,
            Map<String, Object> extraBody) {

        public Slot {
            backend = backend == null || backend.isBlank() ? DEFAULT_BACKEND : backend.trim();
            provider = provider == null || provider.isBlank() ? null : provider.trim().toLowerCase();
            temperature = temperature == null ? 0.0 : temperature;
            maxTokens = maxTokens == null ? 4096 : maxTokens;
            connectTimeout = connectTimeout == null ? Duration.ofSeconds(10) : connectTimeout;
            readTimeout = readTimeout == null ? Duration.ofSeconds(180) : readTimeout;
            extraBody = extraBody == null ? Map.of() : Map.copyOf(extraBody);
        }

        public boolean usable() {
            return enabled && apiKey != null && !apiKey.isBlank() && model != null && !model.isBlank();
        }

        /** Whether the backend of this name should build a client for this slot. */
        public boolean ownedBy(String backendName) {
            return backend.equalsIgnoreCase(backendName);
        }
    }

    /** Every configured slot, text and vision, by name. Names are unique across both. */
    public Map<String, Slot> allSlots() {
        Map<String, Slot> all = new LinkedHashMap<>(models.text());
        all.putAll(models.vision());
        return all;
    }

    /**
     * Slot names for a role, in order. The first is the tie-breaker in a consensus.
     *
     * <p>Empty when a role is unconfigured, which the registry turns into a clear failure
     * at startup rather than a null model reference halfway through a run.
     */
    public List<String> slotsFor(LlmRole role) {
        String snake = role.name().toLowerCase();
        // YAML prefers read-text, the enum is READ_TEXT, and Spring binds a map key
        // verbatim — so both spellings are accepted rather than making the config file
        // adopt Java's naming.
        List<String> found = roles.get(snake.replace('_', '-'));
        return found != null ? found : roles.getOrDefault(snake, List.of());
    }
}
