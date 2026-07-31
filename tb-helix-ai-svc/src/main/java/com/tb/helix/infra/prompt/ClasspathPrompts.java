package com.tb.helix.infra.prompt;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Prompts read from {@code resources/prompts/<name>.md}.
 *
 * <p>Loaded once and held. They are on the hot path of every case, and a prompt that changed
 * between two runs of the same stage would break the cache key's promise that identical
 * inputs give identical answers — so a change takes a restart, deliberately.
 */
@Component
public class ClasspathPrompts implements Prompts {

    private final ResourceLoader resources;
    private final Map<String, String> cache = new LinkedHashMap<>();

    public ClasspathPrompts(ResourceLoader resources) {
        this.resources = resources;
    }

    /**
     * The prompt at {@code resources/prompts/<name>.md}.
     *
     * @throws IllegalStateException when it is missing. A prompt that silently resolves to
     *                               nothing produces a model call with no instruction and an
     *                               answer that looks like a bad model rather than a bad
     *                               deployment.
     */
    @Override
    public synchronized String get(String name) {
        return cache.computeIfAbsent(name, n -> {
            Resource resource = resources.getResource("classpath:prompts/" + n + ".md");
            if (!resource.exists()) {
                throw new IllegalStateException("No prompt at prompts/" + n + ".md");
            }
            try (var in = resource.getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
            } catch (IOException e) {
                throw new IllegalStateException("Could not read prompts/" + n + ".md", e);
            }
        });
    }

    /**
     * The prompt with its {@code {tokens}} filled in.
     *
     * <p>Named tokens rather than positional {@code %s}: a prompt is edited by people who did
     * not write the call site, and counting placeholders across ninety lines to work out
     * which one is the bundle's page count is how the wrong value ends up in the wrong slot.
     *
     * <p>A token with no value is left as it is rather than blanked, so it shows up in the
     * prompt and in the log as {@code {pages}} instead of vanishing.
     */
    @Override
    public String fill(String name, Map<String, Object> values) {
        String text = get(name);
        for (var e : values.entrySet()) {
            text = text.replace("{" + e.getKey() + "}", e.getValue() == null ? "" : String.valueOf(e.getValue()));
        }
        return text;
    }
}
