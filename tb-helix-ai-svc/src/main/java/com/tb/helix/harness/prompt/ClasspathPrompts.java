package com.tb.helix.harness.prompt;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Prompts read from {@code resources/prompts/<name>.st}.
 *
 * <p>Read on every {@link #get}, not held for the life of the process. The filled text is
 * hashed into the derivation-cache key ({@code promptSha}): serving a stale template after
 * an edit keeps the old hash, hits the old answer, and looks exactly like "the cache key
 * ignores the prompt". A .st file is a few kilobytes; re-reading it is free next to the
 * model call it gates.
 */
@Component
public class ClasspathPrompts implements Prompts {

    private final ResourceLoader resources;

    public ClasspathPrompts(ResourceLoader resources) {
        this.resources = resources;
    }

    /**
     * The prompt at {@code resources/prompts/<name>.st}.
     *
     * @throws IllegalStateException when it is missing. A prompt that silently resolves to
     *                               nothing produces a model call with no instruction and an
     *                               answer that looks like a bad model rather than a bad
     *                               deployment.
     */
    @Override
    public String get(String name) {
        Resource resource = resources.getResource("classpath:prompts/" + name + ".st");
        if (!resource.exists()) {
            throw new IllegalStateException("No prompt at prompts/" + name + ".st");
        }
        try (var in = resource.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        } catch (IOException e) {
            throw new IllegalStateException("Could not read prompts/" + name + ".st", e);
        }
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
