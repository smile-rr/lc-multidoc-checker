package com.tb.helix.harness.llm.backend;

import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.tool.ToolSpec;

import java.util.List;
import java.util.Map;

/**
 * Everything one round trip needs.
 *
 * @param role       what is being asked of the model, never which model. Carried so a backend
 *                   can log and route on it; the choice of handle has already been made
 * @param turns      the conversation so far, oldest first. One or two turns for a completion;
 *                   a tool conversation arrives longer each time, grown by the gateway
 * @param tools      schemas the model may call. <b>Read the name, description and parameters;
 *                   never invoke the handler.</b> Running tools and enforcing the turn budget
 *                   belong to the gateway, and a backend that lets a framework run the loop is
 *                   how an unbounded loop against a paid API gets back in
 * @param jsonOutput ask the provider to constrain the answer to JSON. A hint, not a guarantee —
 *                   the gateway still salvages, because a model told to emit JSON still wraps it
 *                   in prose often enough to matter
 * @param maxTokens  null uses the handle's ceiling
 * @param hints      provider or framework specifics that have no place on this type —
 *                   {@code enable_thinking:false} is a fact about one model family, and a field
 *                   for it here would make every future family a change to this record. <b>A
 *                   backend that cannot apply a hint must say so at startup rather than drop
 *                   it</b>: the failure is silent and degrades the answer
 */
public record Exchange(
        LlmRole role,
        List<Turn> turns,
        List<ToolSpec> tools,
        boolean jsonOutput,
        Integer maxTokens,
        Map<String, Object> hints) {

    public Exchange {
        turns = turns == null ? List.of() : List.copyOf(turns);
        tools = tools == null ? List.of() : List.copyOf(tools);
        hints = hints == null ? Map.of() : Map.copyOf(hints);
    }

    /** A plain question, optionally framed by a system instruction. */
    public static Exchange of(LlmRole role, String system, String user,
                              boolean jsonOutput, Integer maxTokens, Map<String, Object> hints) {
        List<Turn> turns = system == null
                ? List.of(Turn.ask(user))
                : List.of(new Turn.System(system), Turn.ask(user));
        return new Exchange(role, turns, List.of(), jsonOutput, maxTokens, hints);
    }
}
