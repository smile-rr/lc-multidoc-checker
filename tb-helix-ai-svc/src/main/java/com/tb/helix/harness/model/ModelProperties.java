package com.tb.helix.harness.model;

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
 * <p>Roles are the indirection that matters. Domain code asks for {@link ModelRole#EXTRACT};
 * configuration decides that means {@code vlm-1}, or {@code vlm-1} and {@code vlm-2}
 * voting. Swapping provider, model or consensus width never reaches a stage.
 */
@ConfigurationProperties(prefix = "helix")
public record ModelProperties(Models models, Map<String, List<String>> roles) {

    public ModelProperties {
        models = models == null ? new Models(Map.of(), Map.of()) : models;
        roles = roles == null ? Map.of() : Map.copyOf(roles);
    }

    public record Models(Map<String, Slot> text, Map<String, Slot> vision) {
        public Models {
            text = text == null ? Map.of() : Map.copyOf(text);
            vision = vision == null ? Map.of() : Map.copyOf(vision);
        }
    }

    /**
     * One provider endpoint.
     *
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
            temperature = temperature == null ? 0.0 : temperature;
            maxTokens = maxTokens == null ? 4096 : maxTokens;
            connectTimeout = connectTimeout == null ? Duration.ofSeconds(10) : connectTimeout;
            readTimeout = readTimeout == null ? Duration.ofSeconds(180) : readTimeout;
            extraBody = extraBody == null ? Map.of() : Map.copyOf(extraBody);
        }

        public boolean usable() {
            return enabled && apiKey != null && !apiKey.isBlank() && model != null && !model.isBlank();
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
    public List<String> slotsFor(ModelRole role) {
        return roles.getOrDefault(role.name().toLowerCase(), List.of());
    }
}
