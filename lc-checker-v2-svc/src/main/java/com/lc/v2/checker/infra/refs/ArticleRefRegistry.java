package com.lc.v2.checker.infra.refs;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.lc.v2.checker.domain.common.ArticleRef;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Loads UCP 600 and ISBP 821 golden source articles at startup.
 * Rule catalog references IDs only; prompts and UI resolve full text via this registry.
 * Served to UI via RefsController GET /api/v2/refs/{id}.
 */
@Component
public class ArticleRefRegistry {

    private static final Logger log = LoggerFactory.getLogger(ArticleRefRegistry.class);

    private Map<String, ArticleRef> byId = Map.of();

    @PostConstruct
    public void load() throws IOException {
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        Map<String, ArticleRef> combined = new LinkedHashMap<>();
        loadFile(mapper, "refs/ucp600.yaml", combined);
        loadFile(mapper, "refs/isbp821.yaml", combined);
        this.byId = Collections.unmodifiableMap(combined);
        log.info("ArticleRefRegistry loaded {} article refs", byId.size());
    }

    public Optional<ArticleRef> byId(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    public boolean has(String id) {
        return byId.containsKey(id);
    }

    public List<ArticleRef> all() {
        return List.copyOf(byId.values());
    }

    /** Token grammar: {@code {{ref.<id>.<field>}}} where field ∈ {text, heading, id}. */
    private static final Pattern REF_TOKEN =
            Pattern.compile("\\{\\{ref\\.([A-Z0-9-]+)\\.(text|heading|id)\\}\\}");

    /**
     * Resolve {@code {{ref.UCP-14-c.text}}} / {@code .heading} / {@code .id}
     * tokens against the corpus. Fail-fast: an unknown id throws — there is no
     * silent fallback. This is the single source of truth for UCP/ISBP text in
     * prompts; see {@code production-readiness.md} §7 / {@code spike-plan.md} W3.
     */
    public String resolve(String template) {
        if (template == null || template.isEmpty()) return template;
        Matcher m = REF_TOKEN.matcher(template);
        StringBuffer out = new StringBuffer();
        while (m.find()) {
            String id = m.group(1);
            String field = m.group(2);
            ArticleRef ref = byId.get(id);
            if (ref == null) {
                throw new IllegalStateException(
                        "Unknown article ref id '" + id + "' referenced as {{ref." + id + "." + field
                        + "}} — not present in ucp600.yaml or isbp821.yaml");
            }
            String value = switch (field) {
                case "text"    -> ref.text() == null ? "" : ref.text();
                case "heading" -> ref.heading() == null ? "" : ref.heading();
                case "id"      -> ref.id();
                default        -> "";
            };
            // Quote replacement to neutralise $ and \ in ref text.
            m.appendReplacement(out, Matcher.quoteReplacement(value));
        }
        m.appendTail(out);
        return out.toString();
    }

    private void loadFile(ObjectMapper mapper, String path, Map<String, ArticleRef> target) throws IOException {
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            log.warn("Article ref file not found: {}", path);
            return;
        }
        try (InputStream in = resource.getInputStream()) {
            RefFile parsed = mapper.readValue(in, RefFile.class);
            if (parsed == null || parsed.refs() == null) return;
            for (ArticleRef ref : parsed.refs()) {
                if (ref.id() == null) continue;
                if (target.put(ref.id(), ref) != null) {
                    throw new IllegalStateException("Duplicate article ref ID: " + ref.id());
                }
            }
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RefFile(List<ArticleRef> refs) {}
}
