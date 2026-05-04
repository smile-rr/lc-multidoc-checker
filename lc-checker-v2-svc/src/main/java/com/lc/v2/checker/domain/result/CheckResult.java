package com.lc.v2.checker.domain.result;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * Outcome of a single rule execution.
 * Both programmatic (SpEL) and AI (LLM) rules produce this.
 *
 * {@code toolCalls} captures the tool-invocation timeline for AGENT_TOOL / AGENTIC
 * tiers (each entry: {tool, args, result}). {@code conditionResults} carries
 * per-clause findings for COND-style rules whose JSON verdict includes a
 * {@code condition_results} array. Both fields are null for PROGRAMMATIC rules
 * and for plain AGENT rules without tool calls.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CheckResult(
        String ruleId,
        Verdict verdict,
        String explanation,
        Map<String, Object> evidence,
        double confidence,
        String checkType,
        List<Map<String, Object>> toolCalls,
        List<Map<String, Object>> conditionResults
) {
    public CheckResult(String ruleId, Verdict verdict, String explanation,
                       Map<String, Object> evidence, double confidence, String checkType) {
        this(ruleId, verdict, explanation, evidence, confidence, checkType, null, null);
    }

    public enum Verdict {
        PASS,
        FAIL,
        NOT_APPLICABLE,
        DOUBTS,
        NEEDS_REVIEW,   // AGENTIC max-iteration cap reached without terminal verdict
        PENDING,        // pre-inserted at start of check phase; replaced when rule completes
        FAILED          // rule could not execute (LLM error, persist error, parse error)
    }

    public boolean routesToHumanQueue() {
        return verdict == Verdict.DOUBTS || verdict == Verdict.FAILED
                || verdict == Verdict.NEEDS_REVIEW;
    }

    public CheckResult withTrace(List<Map<String, Object>> toolCalls,
                                  List<Map<String, Object>> conditionResults) {
        return new CheckResult(ruleId, verdict, explanation, evidence, confidence, checkType,
                toolCalls, conditionResults);
    }
}
