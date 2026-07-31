package com.tb.helix.harness.llm.chatcompletions;

import com.tb.helix.harness.llm.LlmProperties;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One provider endpoint, over the {@code /chat/completions} wire format.
 *
 * <p>MiniMax, DashScope/Bailian, OpenAI, vLLM and Ollama all speak it, which is why there
 * is one of these rather than one per vendor. A provider switch is a base URL and a key.
 *
 * <p>The client is built <b>once, per slot</b>, with connect and read timeouts set. Its
 * predecessor rebuilt a client per call and set neither, so the only bound on a hung
 * provider was a future's timeout further up — and the socket stayed open underneath it.
 */
class ChatCompletionsClient {

    private static final Logger log = LoggerFactory.getLogger(ChatCompletionsClient.class);

    private final String name;
    private final LlmProperties.Slot slot;
    private final RestClient http;
    private final ObjectMapper json;

    ChatCompletionsClient(String name, LlmProperties.Slot slot, ObjectMapper json) {
        this.name = name;
        this.slot = slot;
        this.json = json;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) slot.connectTimeout().toMillis());
        factory.setReadTimeout((int) slot.readTimeout().toMillis());

        this.http = RestClient.builder()
                .baseUrl(slot.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + slot.apiKey())
                .build();
    }

    String name() {
        return name;
    }

    String model() {
        return slot.model();
    }

    String baseUrl() {
        return slot.baseUrl();
    }

    double temperature() {
        return slot.temperature();
    }

    int maxTokens() {
        return slot.maxTokens();
    }

    /** A raw completion. Messages are already assembled; this only sends them. */
    Response complete(List<Map<String, Object>> messages, Integer maxTokens,
                      boolean jsonOutput, List<Map<String, Object>> tools,
                      Map<String, Object> overrides) {

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", slot.model());
        body.put("messages", messages);
        body.put("max_tokens", maxTokens == null ? slot.maxTokens() : maxTokens);
        body.put("temperature", slot.temperature());
        if (jsonOutput) body.put("response_format", Map.of("type", "json_object"));
        if (tools != null && !tools.isEmpty()) body.put("tools", tools);

        // Slot-level quirks first, then per-call overrides. A call that needs reasoning
        // turned on for one rule should win over the slot's blanket setting.
        body.putAll(slot.extraBody());
        if (overrides != null) body.putAll(overrides);

        long started = System.currentTimeMillis();
        RuntimeException last = null;

        for (int attempt = 0; attempt <= slot.maxRetries(); attempt++) {
            try {
                String raw = http.post().uri("/chat/completions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(String.class);
                return parse(raw, (int) (System.currentTimeMillis() - started));

            } catch (org.springframework.web.client.HttpClientErrorException e) {
                // 4xx means the request is wrong and will be wrong again. Retrying a
                // malformed request just spends the timeout budget before failing anyway.
                throw e;
            } catch (RuntimeException e) {
                last = e;
                if (attempt < slot.maxRetries()) {
                    long backoff = 500L << attempt;
                    log.warn("{} attempt {}/{} failed ({}), retrying in {}ms",
                            name, attempt + 1, slot.maxRetries() + 1, e.getMessage(), backoff);
                    try {
                        Thread.sleep(backoff);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw e;
                    }
                }
            }
        }
        throw last;
    }

    /** The parts of a completion anything here cares about. */
    record Response(String content, List<ToolCall> toolCalls, String raw,
                    Integer promptTokens, Integer completionTokens, int latencyMs) {

        boolean wantsTools() {
            return toolCalls != null && !toolCalls.isEmpty();
        }
    }

    record ToolCall(String id, String name, String argumentsJson) {
    }

    private Response parse(String raw, int latencyMs) {
        try {
            JsonNode root = json.readTree(raw);
            JsonNode message = root.path("choices").path(0).path("message");

            String content = message.path("content").asText(null);

            List<ToolCall> calls = new ArrayList<>();
            for (JsonNode tc : message.path("tool_calls")) {
                calls.add(new ToolCall(
                        tc.path("id").asText(),
                        tc.path("function").path("name").asText(),
                        tc.path("function").path("arguments").asText("{}")));
            }

            JsonNode usage = root.path("usage");
            return new Response(
                    LlmText.clean(content),
                    calls,
                    raw,
                    usage.hasNonNull("prompt_tokens") ? usage.get("prompt_tokens").asInt() : null,
                    usage.hasNonNull("completion_tokens") ? usage.get("completion_tokens").asInt() : null,
                    latencyMs);

        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not read a response from " + name + ": " + abbreviate(raw), e);
        }
    }

    private static String abbreviate(String s) {
        if (s == null) return "null";
        return s.length() <= 400 ? s : s.substring(0, 400) + "…";
    }
}
