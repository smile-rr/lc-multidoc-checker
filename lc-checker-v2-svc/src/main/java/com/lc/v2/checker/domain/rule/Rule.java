package com.lc.v2.checker.domain.rule;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import java.util.List;

/**
 * One row in the rule catalog (catalog.yml).
 * Loaded at startup by RuleCatalogRegistry; immutable after load.
 *
 * Compound trigger DSL via {@code triggers}. Legacy {@code triggerDocs} kept for back-compat;
 * if {@code triggers} is null and {@code triggerDocs} non-empty, the loader synthesises an
 * AllOf(DocsPresent(...)) from triggerDocs.
 *
 * {@code origin} distinguishes static catalog rules from ad-hoc rules proposed at runtime by
 * LcRulePlannerAgent. {@code evidenceLcClause} is the source span (substring of :46A:/:47A:)
 * that motivated an ad-hoc rule — null for catalog rules.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record Rule(
        String ruleId,
        List<String> scope,
        List<String> triggerDocs,
        List<String> lcFieldsRequired,
        String checkType,         // PROGRAMMATIC | AGENT | PROGRAMMATIC_AGENT
        String severity,          // CRITICAL | MAJOR | MINOR
        String polarity,          // POSITIVE | NEGATIVE
        boolean waivable,
        List<String> ucpRefs,
        List<String> isbpRefs,
        String expression,        // SpEL for PROGRAMMATIC rules; null for AGENT
        String promptInstruction, // injected into LLM prompt; null for PROGRAMMATIC
        List<String> fieldKeys,
        boolean enabled,
        Triggers.TriggerNode triggers,
        RuleOrigin origin,
        String evidenceLcClause
) {
    public Rule {
        scope = scope == null ? List.of() : List.copyOf(scope);
        triggerDocs = triggerDocs == null ? List.of() : List.copyOf(triggerDocs);
        lcFieldsRequired = lcFieldsRequired == null ? List.of() : List.copyOf(lcFieldsRequired);
        ucpRefs = ucpRefs == null ? List.of() : List.copyOf(ucpRefs);
        isbpRefs = isbpRefs == null ? List.of() : List.copyOf(isbpRefs);
        fieldKeys = fieldKeys == null ? List.of() : List.copyOf(fieldKeys);
        if (origin == null) origin = RuleOrigin.CATALOG;
    }

    public boolean isProgrammatic() { return "PROGRAMMATIC".equals(checkType); }
    public boolean isAgent() { return "AGENT".equals(checkType) || "PROGRAMMATIC_AGENT".equals(checkType); }
}
