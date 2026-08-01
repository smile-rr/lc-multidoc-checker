package com.tb.helix.harness.llm.backend;

/**
 * A model asking for a tool to be run.
 *
 * <p>Arguments stay as the JSON text the model produced rather than a parsed map: models emit
 * malformed argument JSON often enough that parsing at the boundary would turn a recoverable
 * turn — tell the model it got the arguments wrong, let it try again — into a failed call.
 *
 * @param id the provider's correlation id, quoted back when the result is returned
 */
public record ToolCall(String id, String name, String argumentsJson) {
}
