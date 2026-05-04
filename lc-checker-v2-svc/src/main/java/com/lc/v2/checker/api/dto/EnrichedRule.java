package com.lc.v2.checker.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.lc.v2.checker.domain.common.ArticleRef;
import java.util.List;
import java.util.Map;

/**
 * Server-side join of CheckResult × Rule catalog × officer overrides.
 * Used by the Examine stage worklist + RuleDrawer in the UI.
 *
 * Attention chips are derived server-side by combining:
 *   - extraction consensus tier (HIGH/MED/LOW)
 *   - model agreement (3/3 vs 2/3 vs split)
 *   - AGENT vs PROG verdict mismatch
 *   - doc handwriting flags
 *   - override presence + flagged-agent presence
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record EnrichedRule(
        String ruleId,
        String label,
        String article,                 // "UCP 18(c)" — derived from ucpRefs[0]
        List<String> scope,             // doc type names
        String severity,                // CRITICAL | MAJOR | MINOR | OBSERVATION
        String checkType,               // PROGRAMMATIC | AGENT | PROGRAMMATIC_AGENT
        String source,                  // PROG | AI | PROG+AI — derived from checkType
        String verdict,                 // PASS | FAIL | DOUBTS | NA
        String effectiveVerdict,        // verdict OR override.newStatus
        String explanation,
        Map<String, Object> evidence,   // {lc, doc} — extracted from CheckResult.evidence
        Double confidence,
        String agree,                   // "3/3" | "2/3" | "AI" | "—"
        Integer reliab,                 // null in POC (no reliability log yet)
        List<String> attention,         // chip tags
        OverrideRecord override,        // null if not overridden
        List<ArticleRef> ucpRefs,
        List<ArticleRef> isbpRefs,
        Boolean waivable,
        String origin,                  // CATALOG | DYNAMIC
        String evidenceLcClause,        // DYNAMIC only — :46A:/:47A: span that motivated the rule
        List<String> triggerTrace,      // human-readable steps from RuleTriggerEvaluator
        String ucpExcerpt,              // verbatim UCP/ISBP quote from the rule catalog (for drawer display)
        Long durationMs,                // wall-clock duration of this rule's execution; backend-computed
        String startedAt,               // ISO-8601 timestamp from pipeline_steps
        String completedAt,             // ISO-8601 timestamp from pipeline_steps
        String canonicalField           // canonical-field key for UI grouping (currency / amount / …)
) {}
