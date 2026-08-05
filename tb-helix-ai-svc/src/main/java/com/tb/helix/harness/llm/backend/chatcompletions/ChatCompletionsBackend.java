package com.tb.helix.harness.llm.backend.chatcompletions;

import com.tb.helix.harness.llm.LlmProperties;
import com.tb.helix.harness.llm.backend.Completion;
import com.tb.helix.harness.llm.backend.Content;
import com.tb.helix.harness.llm.backend.Exchange;
import com.tb.helix.harness.llm.backend.ModelBackend;
import com.tb.helix.harness.llm.backend.ModelHandle;
import com.tb.helix.harness.llm.backend.Turn;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The {@code /chat/completions} wire format, and nothing else.
 *
 * <p>What is left here after the seam moved down: turns to a JSON message array, an image to a
 * base64 data URL, a tool schema to the {@code function} shape, and the response back again.
 * The consensus, the ledger, the turn budget and the JSON salvage that used to sit alongside
 * this code are provider-neutral and now live above it, where a second backend inherits them
 * instead of having to remember them.
 *
 * <p>Named for the protocol rather than a vendor, because MiniMax, DashScope, vLLM, Ollama,
 * Together, Groq and Fireworks all speak it. Nothing here calls api.openai.com and no
 * configuration in this repository points at it.
 */
@Component
public class ChatCompletionsBackend implements ModelBackend {

    private static final Logger log = LoggerFactory.getLogger(ChatCompletionsBackend.class);

    private final Map<String, ChatCompletionsClient> clients = new LinkedHashMap<>();
    private final Map<String, ModelHandle> handles = new LinkedHashMap<>();

    public ChatCompletionsBackend(LlmProperties props, ObjectMapper json) {
        props.allSlots().forEach((name, slot) -> {
            // Claimed by name, not by capability. This backend could serve any OpenAI-shaped
            // endpoint and so could the Spring AI one, so "can I handle this?" would have
            // both of them answering yes for the same slot and the winner would be whichever
            // bean Spring happened to register first.
            if (!slot.ownedBy(name())) return;
            if (slot.usable()) {
                clients.put(name, new ChatCompletionsClient(name, slot, json));
                handles.put(name, new ModelHandle(name, slot.model(), slot.baseUrl(),
                        slot.temperature(), slot.maxTokens()));
            } else if (slot.enabled()) {
                log.warn("Slot {} is enabled but has no api key or model — skipped", name);
            }
        });
        log.info("Backend '{}' serving model(s): {}", name(), clients.keySet());
    }

    @Override
    public String name() {
        return "chat-completions";
    }

    @Override
    public Optional<ModelHandle> handle(String id) {
        return Optional.ofNullable(handles.get(id));
    }

    @Override
    public Completion call(ModelHandle handle, Exchange exchange) {
        ChatCompletionsClient client = clients.get(handle.id());
        if (client == null) {
            throw new IllegalStateException("No client for handle " + handle.id());
        }

        List<Map<String, Object>> messages = exchange.turns().stream()
                .map(ChatCompletionsBackend::message).toList();

        List<Map<String, Object>> toolSchemas = exchange.tools().isEmpty() ? null
                : exchange.tools().stream()
                        .map(t -> Map.<String, Object>of("type", "function", "function",
                                Map.of("name", t.name(), "description", t.description(),
                                        "parameters", t.parameters())))
                        .toList();

        var response = client.complete(messages, exchange.maxTokens(), exchange.jsonOutput(),
                toolSchemas, exchange.hints());

        return new Completion(response.content(), response.reasoning(),
                response.toolCalls() == null ? List.of() : response.toolCalls(),
                response.raw(), response.promptTokens(), response.completionTokens(),
                response.cachedPromptTokens(), response.cacheWriteTokens(),
                response.reasoningTokens(), response.latencyMs());
    }

    // --- Turns to messages ---------------------------------------------------

    private static Map<String, Object> message(Turn turn) {
        return switch (turn) {
            case Turn.System s -> Map.of("role", "system", "content", s.text());
            case Turn.User u -> Map.of("role", "user", "content", parts(u.content()));
            case Turn.Assistant a -> assistant(a);
            case Turn.ToolResult r -> Map.of("role", "tool", "tool_call_id", r.callId(),
                    "name", r.name(), "content", r.content());
        };
    }

    /**
     * The parts of a user turn, <b>in the order they were given</b>.
     *
     * <p>Not a detail. A document is read three times over byte-identical images differing only
     * in the trailing instruction, and a provider's prefix cache matches from the first content
     * block — so images first means the second and third passes ride the prefix the first paid
     * for, and the images are about 95% of the input. Sorting, grouping or hoisting the text
     * here would cost roughly three times the input tokens on every bundle and raise no error
     * anywhere.
     *
     * <p>A turn that is only text collapses to a plain string rather than a one-element parts
     * array. Some providers treat the two differently and the string is the better-trodden path;
     * it is also what this sent before the seam existed, and this refactor is not the place to
     * change what goes on the wire.
     */
    private static Object parts(List<Content> content) {
        boolean allText = content.stream().allMatch(c -> c instanceof Content.Text);
        if (allText) {
            StringBuilder sb = new StringBuilder();
            for (Content c : content) sb.append(((Content.Text) c).text());
            return sb.toString();
        }

        List<Map<String, Object>> out = new ArrayList<>(content.size());
        for (Content c : content) {
            switch (c) {
                case Content.Image image -> out.add(Map.of("type", "image_url", "image_url",
                        Map.of("url", "data:" + image.mimeType() + ";base64,"
                                + Base64.getEncoder().encodeToString(image.bytes()))));
                case Content.Text text -> out.add(Map.of("type", "text", "text", text.text()));
            }
        }
        return out;
    }

    private static Map<String, Object> assistant(Turn.Assistant a) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("role", "assistant");
        msg.put("content", a.text() == null ? "" : a.text());
        if (!a.toolCalls().isEmpty()) {
            msg.put("tool_calls", a.toolCalls().stream().map(tc -> Map.of(
                    "id", tc.id(), "type", "function",
                    "function", Map.of("name", tc.name(), "arguments", tc.argumentsJson()))).toList());
        }
        return msg;
    }
}
