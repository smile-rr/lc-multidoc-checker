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
 * Execution tiers (checkType): PROGRAMMATIC | AGENT | AGENT_TOOL | AGENTIC.
 *   - thinkingEnabled: per-rule override of the global enable_thinking gate; null = use tier default.
 *   - maxIterations:   AGENTIC convergence cap; null = use tier default (4).
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record Rule(
        String ruleId,
        String name,
        int version,
        String canonicalField,
        List<String> appliesTo,
        List<String> scope,
        List<String> triggerDocs,
        List<String> lcFieldsRequired,
        String checkType,
        String severity,
        String polarity,
        boolean waivable,
        List<String> ucpRefs,
        List<String> isbpRefs,
        String expression,
        String promptInstruction,
        List<String> fieldKeys,
        boolean enabled,
        Triggers.TriggerNode triggers,
        Boolean thinkingEnabled,
        Integer maxIterations,
        String ucpExcerpt
) {
    public Rule {
        appliesTo = appliesTo == null ? List.of() : List.copyOf(appliesTo);
        scope = scope == null ? List.of() : List.copyOf(scope);
        triggerDocs = triggerDocs == null ? List.of() : List.copyOf(triggerDocs);
        lcFieldsRequired = lcFieldsRequired == null ? List.of() : List.copyOf(lcFieldsRequired);
        ucpRefs = ucpRefs == null ? List.of() : List.copyOf(ucpRefs);
        isbpRefs = isbpRefs == null ? List.of() : List.copyOf(isbpRefs);
        fieldKeys = fieldKeys == null ? List.of() : List.copyOf(fieldKeys);
        if (version <= 0) version = 1;
    }

    public boolean isProgrammatic() { return "PROGRAMMATIC".equals(checkType); }
    public boolean isAgent()        { return "AGENT".equals(checkType); }
    public boolean isAgentTool()    { return "AGENT_TOOL".equals(checkType); }
    public boolean isAgentic()      { return "AGENTIC".equals(checkType); }
    /** True if the rule is executed by AgentRuleExecutor (any non-PROGRAMMATIC tier). */
    public boolean isLlm()          { return !isProgrammatic(); }
}
