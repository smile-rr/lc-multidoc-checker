package com.lc.v2.checker.infra.rules;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.lc.v2.checker.domain.rule.Rule;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Loads and caches the rule catalog from catalog.yml at application startup.
 * Fail-fast: missing file or empty catalog throws at boot.
 */
@Component
public class RuleCatalogRegistry {

    private static final Logger log = LoggerFactory.getLogger(RuleCatalogRegistry.class);

    private final List<Rule> allRules;
    private final List<Rule> enabledRules;

    public RuleCatalogRegistry(
            ResourceLoader resourceLoader,
            @Value("${rules.catalog-path:classpath:/rules/catalog.yml}") String catalogPath)
            throws IOException {
        Resource resource = resourceLoader.getResource(catalogPath);
        if (!resource.exists()) {
            throw new IllegalStateException("Rule catalog not found at " + catalogPath);
        }
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory())
                .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        CatalogFile parsed;
        try (InputStream in = resource.getInputStream()) {
            parsed = mapper.readValue(in, CatalogFile.class);
        }
        if (parsed == null || parsed.rules() == null || parsed.rules().isEmpty()) {
            throw new IllegalStateException("Rule catalog at " + catalogPath + " is empty");
        }
        this.allRules = List.copyOf(parsed.rules());
        this.enabledRules = allRules.stream().filter(Rule::enabled).toList();
        for (Rule r : allRules) {
            if ("PROGRAMMATIC_AGENT".equals(r.checkType())) {
                log.warn("Rule {} uses deprecated checkType PROGRAMMATIC_AGENT — alias of AGENT_TOOL; "
                        + "update catalog.yml", r.ruleId());
            }
        }
        for (Rule r : allRules) {
            if (r.triggers() != null && r.triggerDocs() != null && !r.triggerDocs().isEmpty()) {
                log.warn("Rule {} declares both triggers and triggerDocs — triggers wins, "
                        + "triggerDocs ignored at runtime", r.ruleId());
            }
        }
        log.info("RuleCatalogRegistry loaded {} rules ({} enabled, {} with compound triggers)",
                allRules.size(), enabledRules.size(),
                allRules.stream().filter(r -> r.triggers() != null).count());
    }

    public List<Rule> all() { return allRules; }
    public List<Rule> enabledRules() { return enabledRules; }
    public Optional<Rule> byId(String ruleId) {
        return allRules.stream().filter(r -> ruleId.equals(r.ruleId())).findFirst();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CatalogFile(List<Rule> rules) {}
}
