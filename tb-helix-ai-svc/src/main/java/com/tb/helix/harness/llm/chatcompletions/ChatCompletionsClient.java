package com.tb.helix.harness.llm.chatcompletions;

import com.tb.helix.harness.llm.LlmProperties;
import com.tb.helix.harness.llm.LlmText;
import com.tb.helix.harness.llm.backend.ToolCall;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

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

    /**
     * How many times a 429 is waited out, and the longest single wait.
     *
     * <p>Constants rather than slot configuration, because this is not the same question the
     * slot's {@code max-retries} answers. That budget is "how many times is it worth asking
     * again when something went wrong"; this is "the provider told us to wait, so wait". A
     * slot set to one retry — which the vision slots are, deliberately, because a failed
     * vision call is expensive — would otherwise give a rate limit a single 500 ms pause and
     * then drop the document.
     *
     * <p>Three waits of 1s, 2s and 4s against a 240 s read timeout. The cap is what stops a
     * provider's {@code Retry-After} of a quarter of an hour from parking a stage on it.
     */
    private static final int THROTTLE_RETRIES = 3;
    private static final long THROTTLE_WAIT_CAP_MS = 20_000;

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
        int failed = 0;     // the slot's ordinary retry budget
        int throttled = 0;  // 429s, budgeted separately — see THROTTLE_RETRIES

        while (true) {
            try {
                String raw = http.post().uri("/chat/completions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(String.class);
                return parse(raw, (int) (System.currentTimeMillis() - started));

            } catch (HttpClientErrorException e) {
                // 4xx means the request is wrong and will be wrong again. Retrying a
                // malformed request just spends the timeout budget before failing anyway.
                //
                // 429 is the exception, and it is not a statement about the request at all:
                // it says the provider is busy, which is what a backoff is for. This barely
                // mattered while a stage read one document at a time — a serial run never
                // pushed hard enough to be told to wait. A stage that reads six at once does,
                // and rethrowing here lost a whole document, unread, to a pause of a second.
                if (e.getStatusCode().value() != HttpStatus.TOO_MANY_REQUESTS.value()) throw e;
                last = e;
                if (++throttled > THROTTLE_RETRIES) break;
                final int nth = throttled;
                long wait = retryAfterMs(e).orElseGet(() -> 1000L << (nth - 1));
                log.warn("{} was throttled ({}/{}), waiting {}ms",
                        name, throttled, THROTTLE_RETRIES, wait);
                if (!sleep(wait)) throw e;

            } catch (RuntimeException e) {
                last = e;
                if (++failed > slot.maxRetries()) break;
                long backoff = 500L << (failed - 1);
                log.warn("{} attempt {}/{} failed ({}), retrying in {}ms",
                        name, failed, slot.maxRetries() + 1, e.getMessage(), backoff);
                if (!sleep(backoff)) throw e;
            }
        }
        throw last;
    }

    /**
     * How long the provider asked us to wait, when it said.
     *
     * <p>Preferred over our own backoff because the provider knows when its window resets and
     * we are guessing. The header also has an HTTP-date form; nothing seen here uses it, and
     * failing to parse simply falls back to the exponential wait rather than to no wait.
     */
    private static OptionalLong retryAfterMs(HttpClientErrorException e) {
        String header = e.getResponseHeaders() == null
                ? null : e.getResponseHeaders().getFirst("Retry-After");
        if (header == null || header.isBlank()) return OptionalLong.empty();
        try {
            long seconds = Long.parseLong(header.strip());
            if (seconds < 0) return OptionalLong.empty();
            return OptionalLong.of(Math.min(seconds * 1000L, THROTTLE_WAIT_CAP_MS));
        } catch (NumberFormatException nfe) {
            return OptionalLong.empty();
        }
    }

    /**
     * Waits, and says whether it got to.
     *
     * <p>False means the thread was interrupted, which is a request to stop rather than a
     * reason to try again — the caller rethrows what it was holding instead of looping into
     * another wait that will be interrupted too.
     */
    private static boolean sleep(long ms) {
        try {
            Thread.sleep(ms);
            return true;
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * The parts of a completion anything here cares about.
     *
     * @param cachedPromptTokens how many of {@code promptTokens} the provider served from its
     *                           own prompt cache. Billed, at roughly a tenth of the input rate
     *                           — which makes it a different thing from our derivation cache,
     *                           where no call happens and nothing is billed at all. Both get
     *                           called "cache" in conversation and they must not be added
     *                           together anywhere.
     */
    record Response(String content, List<ToolCall> toolCalls, String raw,
                    Integer promptTokens, Integer completionTokens, Integer cachedPromptTokens,
                    int latencyMs) {
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
            // Two places, because providers disagree: OpenAI and DashScope nest it under
            // prompt_tokens_details, others put it straight on usage. Absent means zero
            // rather than unknown — a provider with no prompt cache reports nothing.
            JsonNode cached = usage.path("prompt_tokens_details").path("cached_tokens");
            if (!cached.isInt()) cached = usage.path("cached_tokens");
            return new Response(
                    LlmText.clean(content),
                    calls,
                    raw,
                    usage.hasNonNull("prompt_tokens") ? usage.get("prompt_tokens").asInt() : null,
                    usage.hasNonNull("completion_tokens") ? usage.get("completion_tokens").asInt() : null,
                    cached.isInt() ? cached.asInt() : 0,
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
