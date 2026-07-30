package com.tb.helix.core.model;

import java.util.Map;
import java.util.function.Function;

/**
 * A tool a model may call, declared by the module that owns it.
 *
 * <p>A record with a handler rather than an annotation on a method, so tools stay in the
 * business module that understands them. Date arithmetic and currency comparison belong
 * to lc-check; the gateway's only interest is that they have a name, a schema and
 * something to invoke.
 *
 * <p>That is also what keeps the boundary intact: an annotation-driven registry would put
 * the tool implementations wherever the scanner looks, which in practice means
 * infrastructure — and then a rule's arithmetic would live next to the HTTP client.
 *
 * @param name        what the model calls it. Stable — it appears in stored tool traces.
 * @param description what it does and when to use it. This is prompt text; vagueness here
 *                    shows up as a model calling the wrong tool.
 * @param parameters  JSON Schema for the arguments
 * @param handler     receives parsed arguments, returns a result to feed back. Should
 *                    return an explanatory string on bad input rather than throwing —
 *                    a model can recover from "that date is not ISO-8601", but an
 *                    exception ends the conversation.
 */
public record ToolSpec(
        String name,
        String description,
        Map<String, Object> parameters,
        Function<Map<String, Object>, String> handler) {

    /** One invocation, recorded so a conclusion can be audited turn by turn. */
    public record Call(String tool, Map<String, Object> arguments, String result) {
    }
}
