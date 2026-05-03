package com.lc.v2.checker.domain.result;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * Outcome of a single rule execution.
 * Both programmatic (SpEL) and AI (LLM) rules produce this.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CheckResult(
        String ruleId,
        Verdict verdict,
        String explanation,
        Map<String, Object> evidence,
        double confidence,
        String checkType   // PROGRAMMATIC | AGENT | ADHOC
) {
    public enum Verdict {
        PASS,
        FAIL,
        NOT_APPLICABLE,
        DOUBTS          // confidence < threshold, routes to human queue
    }

    public boolean routesToHumanQueue() {
        return verdict == Verdict.DOUBTS;
    }
}
