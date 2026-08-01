package com.tb.helix.harness.llm.backend;

import java.util.List;

/**
 * One turn of a conversation.
 *
 * <p>Four kinds, because every model API worth adapting has exactly these four — an
 * instruction that frames the exchange, what was asked, what was answered, and what a tool
 * returned. Sealed, so a backend's {@code switch} over them is checked by the compiler and a
 * fifth kind cannot be added without every backend being made to consider it.
 *
 * <p>A single completion is a list of one or two of these. A tool conversation grows the list
 * turn by turn, and the growing is done by the gateway — which is what makes the turn budget
 * enforceable in one place.
 */
public sealed interface Turn {

    /** How the model should behave and what shape the answer takes. */
    record System(String text) implements Turn {
    }

    /** What is being asked, as ordered parts. See {@link Content} on why order is explicit. */
    record User(List<Content> content) implements Turn {

        public User {
            content = content == null ? List.of() : List.copyOf(content);
        }
    }

    /**
     * What the model said.
     *
     * <p>Carries text, tool calls, or both — a model may explain itself and ask for a tool in
     * the same turn, and dropping either half loses the thread of the conversation.
     */
    record Assistant(String text, List<ToolCall> toolCalls) implements Turn {

        public Assistant {
            toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
        }
    }

    /** What running the tool produced, always as text the model can read. */
    record ToolResult(String callId, String name, String content) implements Turn {
    }

    /** The common case: a question with no images. */
    static Turn ask(String text) {
        return new User(List.of(new Content.Text(text)));
    }
}
