package com.lc.v2.checker.infra.rules;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Loads and caches the rule catalog from catalog.yml at application startup.
 * Fail-fast: missing file, empty catalog, unknown check_type, or non-conforming
 * rule IDs throw at boot.
 */
@Component
public class RuleCatalogRegistry {

    private static final Logger log = LoggerFactory.getLogger(RuleCatalogRegistry.class);

    private static final Set<String> VALID_CHECK_TYPES =
            Set.of("PROGRAMMATIC", "AGENT", "AGENT_TOOL", "AGENTIC");

    // Suffix is either two digits (e.g. DATE-01) or two digits + optional
    // uppercase letter (e.g. COND-47A) to allow SWIFT-tag-derived ids.
    private static final Pattern ID_PATTERN =
            Pattern.compile("^(DATE|AMT|DOCSET|GOODS|TRANS|PARTY|XD|CERT|COND)-\\d{2}[A-Z]?$");

    private final List<Rule> allRules;
    private final List<Rule> enabledRules;

    public RuleCatalogRegistry(
            ResourceLoader resourceLoader,
            ArticleRefRegistry refs,
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

        List<Rule> normalised = new ArrayList<>(parsed.rules().size());
        for (Rule r : parsed.rules()) {
            validate(r);
            validateRefs(r, refs);
            normalised.add(applyTierDefaults(r));
        }
        this.allRules = List.copyOf(normalised);
        this.enabledRules = allRules.stream().filter(Rule::enabled).toList();

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

    /**
     * W3 — startup validation: every UCP/ISBP id cited by a rule must exist in
     * the corpus YAML. Fail-fast on unknown id; no silent fallback.
     */
    private static void validateRefs(Rule r, ArticleRefRegistry refs) {
        for (String id : r.ucpRefs()) {
            if (!refs.has(id)) {
                throw new IllegalStateException("Rule " + r.ruleId()
                        + " cites unknown UCP id '" + id + "' — not in refs/ucp600.yaml");
            }
        }
        for (String id : r.isbpRefs()) {
            if (!refs.has(id)) {
                throw new IllegalStateException("Rule " + r.ruleId()
                        + " cites unknown ISBP id '" + id + "' — not in refs/isbp821.yaml");
            }
        }
    }

    private static void validate(Rule r) {
        if (r.ruleId() == null || !ID_PATTERN.matcher(r.ruleId()).matches()) {
            throw new IllegalStateException(
                    "Rule ID '" + r.ruleId() + "' does not match pattern " + ID_PATTERN.pattern());
        }
        if (r.checkType() == null || !VALID_CHECK_TYPES.contains(r.checkType())) {
            throw new IllegalStateException(
                    "Rule " + r.ruleId() + " has unknown check_type '" + r.checkType()
                            + "'; expected one of " + VALID_CHECK_TYPES);
        }
    }

    /**
     * Apply tier defaults for {@code thinkingEnabled} only. {@code maxIterations}
     * is left null when the catalog entry omits it; AgentRuleExecutor resolves
     * the effective cap against {@code app.llm.max-iterations} at call time so
     * the project-level budget governs by default.
     */
    private static Rule applyTierDefaults(Rule r) {
        Boolean thinking = r.thinkingEnabled();
        Integer maxIter = r.maxIterations();
        switch (r.checkType()) {
            case "AGENTIC" -> {
                if (thinking == null) thinking = Boolean.TRUE;
            }
            case "AGENT", "AGENT_TOOL" -> {
                if (thinking == null) thinking = Boolean.FALSE;
            }
            default -> { /* PROGRAMMATIC — no LLM, fields stay null */ }
        }
        return new Rule(
                r.ruleId(), r.name(), r.version(), r.canonicalField(),
                r.appliesTo(), r.scope(), r.triggerDocs(), r.lcFieldsRequired(),
                r.checkType(), r.severity(), r.polarity(), r.waivable(),
                r.ucpRefs(), r.isbpRefs(),
                r.expression(), r.promptInstruction(), r.fieldKeys(),
                r.enabled(), r.triggers(),
                thinking, maxIter,
                r.ucpExcerpt(),
                r.executionStrategy());
    }

    public List<Rule> all() { return allRules; }
    public List<Rule> enabledRules() { return enabledRules; }
    public Optional<Rule> byId(String ruleId) {
        return allRules.stream().filter(r -> ruleId.equals(r.ruleId())).findFirst();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CatalogFile(List<Rule> rules) {}
}
