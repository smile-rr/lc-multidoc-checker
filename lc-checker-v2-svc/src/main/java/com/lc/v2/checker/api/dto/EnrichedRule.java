package com.lc.v2.checker.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.lc.v2.checker.domain.common.ArticleRef;
import java.util.List;
import java.util.Map;

/**
 * Server-side join of CheckResult × Rule catalog × officer overrides.
 * Used by the Examine stage worklist + RuleDrawer in the UI.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EnrichedRule(
        String ruleId,
        String label,
        String article,
        List<String> scope,
        String severity,
        String checkType,                              // PROGRAMMATIC | AGENT | AGENT_TOOL | AGENTIC
        String source,                                 // PROG | AGENT | AGENT+T | AGENTIC
        String verdict,
        String effectiveVerdict,
        String explanation,
        Map<String, Object> evidence,
        Double confidence,
        String agree,
        Integer reliab,
        List<String> attention,
        OverrideRecord override,
        List<ArticleRef> ucpRefs,
        List<ArticleRef> isbpRefs,
        Boolean waivable,
        List<String> triggerTrace,
        String ucpExcerpt,
        Long durationMs,
        String startedAt,
        String completedAt,
        String canonicalField,
        List<Map<String, Object>> toolCalls,
        List<Map<String, Object>> conditionResults
) {}
