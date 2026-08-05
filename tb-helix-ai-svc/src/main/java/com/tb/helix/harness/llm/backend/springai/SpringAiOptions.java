package com.tb.helix.harness.llm.backend.springai;

import com.tb.helix.harness.llm.backend.Exchange;
import com.tb.helix.harness.llm.backend.ModelHandle;
import com.tb.helix.harness.llm.tool.ToolSpec;

import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.DefaultToolDefinition;
import org.springframework.ai.tool.definition.ToolDefinition;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

/**
 * Per-call options, and the one place the 1.1 → 2.0 upgrade touches.
 *
 * <p>Everything version-specific about driving Spring AI is deliberately gathered here so that
 * moving to 2.0 — when this service moves to Spring Boot 4 — is a change to one file. The
 * single call that differs is {@code internalToolExecutionEnabled(false)}: 2.0 removed the
 * setting because it removed the built-in tool loop from every {@code ChatModel}, so the
 * migration is to delete two lines, not to restructure anything.
 */
final class SpringAiOptions {

    private SpringAiOptions() {
    }

    /**
     * Options for one exchange, in the shape the slot's provider wants.
     *
     * <p><b>{@code internalToolExecutionEnabled(false)} is the load-bearing line.</b> Left at
     * its default, Spring AI sees tool callbacks, calls them itself, and loops until the model
     * stops asking — with no turn budget, no ledger row per completion, and no
     * {@code ToolSpec.Call} audit trail. {@code StandardLlmGateway.loop} would then be handed a
     * finished conversation and would count it as one iteration. Every guarantee the tool
     * budget offers would be gone and nothing would report it.
     */
    static ChatOptions forExchange(String provider, ModelHandle handle, Exchange exchange,
                                   ObjectMapper json) {
        List<ToolCallback> callbacks = callbacks(exchange.tools(), json);
        Integer maxTokens = exchange.maxTokens() == null ? handle.maxTokens() : exchange.maxTokens();

        return switch (provider) {
            case SpringAiBackend.ANTHROPIC -> AnthropicChatOptions.builder()
                    .model(handle.model())
                    .temperature(handle.temperature())
                    .maxTokens(maxTokens)
                    .toolCallbacks(callbacks)
                    .internalToolExecutionEnabled(false)
                    .build();
            case SpringAiBackend.OPENAI -> OpenAiChatOptions.builder()
                    .model(handle.model())
                    .temperature(handle.temperature())
                    .maxTokens(maxTokens)
                    .toolCallbacks(callbacks)
                    .internalToolExecutionEnabled(false)
                    .build();
            default -> throw new IllegalStateException("Unknown provider: " + provider);
        };
    }

    /**
     * Our tool declarations as Spring AI's, <b>with the handler deliberately not wired in</b>.
     *
     * <p>A {@link ToolCallback} carries both a schema and something to call, and Spring AI will
     * happily call it. Since {@code internalToolExecutionEnabled} is false it never should —
     * but a callback whose {@code call} actually ran the handler would mean one accidental
     * default flipping the framework into executing the tool loop, silently and correctly
     * enough that nothing would look wrong until the bill arrived. So these callbacks throw.
     * If one is ever invoked, that is a bug in this backend's configuration and it should be
     * loud, immediate and impossible to mistake for a model's answer.
     */
    private static List<ToolCallback> callbacks(List<ToolSpec> tools, ObjectMapper json) {
        return tools.stream().map(spec -> (ToolCallback) new ToolCallback() {

            @Override
            public ToolDefinition getToolDefinition() {
                return DefaultToolDefinition.builder()
                        .name(spec.name())
                        .description(spec.description())
                        .inputSchema(schema(spec.parameters(), json))
                        .build();
            }

            @Override
            public String call(String toolInput) {
                throw new IllegalStateException(
                        "Spring AI tried to execute tool '" + spec.name() + "'. Tool execution "
                        + "belongs to StandardLlmGateway, which owns the turn budget and the "
                        + "ledger; internalToolExecutionEnabled must be false on every options "
                        + "object this backend builds.");
            }
        }).toList();
    }

    /** A JSON Schema map as the text Spring AI wants. */
    private static String schema(Map<String, Object> parameters, ObjectMapper json) {
        try {
            return json.writeValueAsString(parameters == null ? Map.of() : parameters);
        } catch (Exception e) {
            throw new IllegalStateException("Tool parameters are not serialisable: " + e.getMessage(), e);
        }
    }
}
