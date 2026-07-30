package com.tb.helix.harness.llm.tool;

import com.tb.helix.harness.llm.LlmRole;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * A tool-calling conversation with a hard turn budget.
 *
 * @param role           usually {@link LlmRole#JUDGE}
 * @param system         persona and output contract
 * @param user           the question
 * @param tools          what the model may call. An empty list makes this a plain
 *                       completion, which is a mistake worth catching at the call site.
 * @param maxIterations  the ceiling on completions. Not advisory: when it is reached the
 *                       result says so and carries the calls made so far. A rule may
 *                       lower this; nothing raises it above the configured cap.
 * @param overrides      per-call additions to the request body
 */
public record ToolRequest(
        LlmRole role,
        String system,
        String user,
        List<ToolSpec> tools,
        int maxIterations,
        Map<String, Object> overrides) {

    public ToolRequest {
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(user, "user");
        tools = tools == null ? List.of() : List.copyOf(tools);
        if (maxIterations < 1) {
            throw new IllegalArgumentException("maxIterations must be at least 1, got: " + maxIterations);
        }
        overrides = overrides == null ? Map.of() : Map.copyOf(overrides);
    }
}
