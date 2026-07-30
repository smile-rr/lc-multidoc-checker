package com.tb.helix.harness.model;

import java.util.List;

/**
 * The end of a tool-calling conversation.
 *
 * @param content      the final answer, or null when the budget ran out first
 * @param toolCalls    every call made, in order. Stored with the check result: a
 *                     conclusion reached by computing a date difference is only
 *                     auditable if the computation is on the record.
 * @param iterations   completions actually used
 * @param budgetSpent  true when the turn budget ended the conversation rather than the
 *                     model doing so. The caller must treat this as "no conclusion" —
 *                     a partial conversation that gets read as a verdict is how an
 *                     unfinished check comes to look like a passing one.
 * @param model        the model that answered
 * @param usage        summed across every iteration
 */
public record ToolResult(
        String content,
        List<ToolSpec.Call> toolCalls,
        int iterations,
        boolean budgetSpent,
        String model,
        TokenUsage usage) {

    /** Whether this carries an answer worth acting on. */
    public boolean concluded() {
        return !budgetSpent && content != null && !content.isBlank();
    }
}
