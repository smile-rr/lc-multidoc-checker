package com.tb.helix.harness.llm.chatcompletions;

import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmProperties;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.TokenUsage;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.harness.llm.text.TextResult;
import com.tb.helix.harness.llm.tool.ToolRequest;
import com.tb.helix.harness.llm.tool.ToolResult;
import com.tb.helix.harness.llm.tool.ToolSpec;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.harness.llm.vision.VisionResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.infra.error.LlmException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The one path to a model.
 *
 * <p>Roles in, answers out. Which provider, which model, how many slots vote — all
 * configuration. Nothing above this line knows a vendor exists.
 */
@Component
public class ChatCompletionsGateway implements LlmGateway {

    private static final Logger log = LoggerFactory.getLogger(ChatCompletionsGateway.class);

    private final LlmProperties props;
    private final ObjectMapper json;
    private final Map<String, ChatCompletionsClient> clients = new LinkedHashMap<>();
    private final ExecutorService slotPool = Executors.newVirtualThreadPerTaskExecutor();

    public ChatCompletionsGateway(LlmProperties props, ObjectMapper json) {
        this.props = props;
        this.json = json;
        props.allSlots().forEach((name, slot) -> {
            if (slot.usable()) clients.put(name, new ChatCompletionsClient(name, slot, json));
            else if (slot.enabled()) log.warn("Slot {} is enabled but has no api key or model — skipped", name);
        });
        log.info("Model slots ready: {}", clients.keySet());
        props.roles().forEach((role, slots) -> {
            List<String> missing = slots.stream().filter(s -> !clients.containsKey(s)).toList();
            // A warning, not a failure: the service must still boot for governance work
            // with no keys configured. The failure comes when the role is actually used.
            if (!missing.isEmpty()) log.warn("Role '{}' names unusable slot(s) {}", role, missing);
        });
    }

    // --- Text ---------------------------------------------------------------

    @Override
    public TextResult complete(TextRequest request) {
        ChatCompletionsClient client = firstUsable(request.role());
        var messages = new ArrayList<Map<String, Object>>();
        if (request.system() != null) messages.add(Map.of("role", "system", "content", request.system()));
        messages.add(Map.of("role", "user", "content", request.user()));

        var response = client.complete(messages, request.maxTokens(), request.jsonOutput(),
                null, request.overrides());

        return new TextResult(response.content(), response.raw(), client.model(),
                new TokenUsage(response.promptTokens(), response.completionTokens(),
                        response.latencyMs(), false));
    }

    // --- Vision -------------------------------------------------------------

    @Override
    public VisionResult read(VisionRequest request) {
        List<ChatCompletionsClient> slots = usableSlots(request.role());

        // Slots run concurrently; each carries its own failure. A slot that dies is dropped
        // rather than failing the read — redundancy is the entire reason for having more
        // than one, and a three-slot consensus that silently became one must still be
        // visible, which is what SlotResult.failed carries.
        List<CompletableFuture<VisionResult.SlotResult>> futures = slots.stream()
                .map(client -> CompletableFuture.supplyAsync(() -> readOne(client, request), slotPool))
                .toList();

        List<VisionResult.SlotResult> results = futures.stream().map(CompletableFuture::join).toList();
        List<VisionResult.SlotResult> good = results.stream().filter(r -> !r.failed()).toList();

        if (good.isEmpty()) {
            throw new LlmException("Every vision slot failed for role " + request.role(),
                    new LlmException.LlmRoleFailure(request.role().name(),
                            results.stream().map(VisionResult.SlotResult::error).toList()));
        }
        return Consensus.of(good, results);
    }

    private VisionResult.SlotResult readOne(ChatCompletionsClient client, VisionRequest request) {
        try {
            List<Map<String, Object>> parts = new ArrayList<>();
            parts.add(Map.of("type", "text", "text", request.prompt()));
            for (byte[] page : request.pages()) {
                parts.add(Map.of("type", "image_url", "image_url",
                        Map.of("url", "data:image/png;base64," + Base64.getEncoder().encodeToString(page))));
            }
            var response = client.complete(
                    List.of(Map.of("role", "user", "content", parts)),
                    null, true, null, request.overrides());

            Map<String, Object> fields = parseFields(response.content());
            return new VisionResult.SlotResult(client.name(), client.model(), fields, response.raw(),
                    false, null,
                    new TokenUsage(response.promptTokens(), response.completionTokens(),
                            response.latencyMs(), false));

        } catch (RuntimeException e) {
            log.warn("Vision slot {} failed: {}", client.name(), e.toString());
            return new VisionResult.SlotResult(client.name(), client.model(), Map.of(), null,
                    true, e.getMessage(), new TokenUsage(0, 0, 0, false));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFields(String content) {
        String body = LlmText.extractJson(content);
        if (body == null) throw new IllegalStateException("No JSON object in the response");
        try {
            return json.readValue(body, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("Response was not readable JSON: " + e.getMessage(), e);
        }
    }

    // --- Tool loop ----------------------------------------------------------

    @Override
    public ToolResult loop(ToolRequest request) {
        ChatCompletionsClient client = firstUsable(request.role());
        Map<String, ToolSpec> byName = new HashMap<>();
        request.tools().forEach(t -> byName.put(t.name(), t));

        List<Map<String, Object>> messages = new ArrayList<>();
        if (request.system() != null) messages.add(Map.of("role", "system", "content", request.system()));
        messages.add(Map.of("role", "user", "content", request.user()));

        List<Map<String, Object>> toolSchemas = request.tools().stream()
                .map(t -> Map.<String, Object>of("type", "function", "function",
                        Map.of("name", t.name(), "description", t.description(), "parameters", t.parameters())))
                .toList();

        List<ToolSpec.Call> calls = new ArrayList<>();
        int promptTokens = 0, completionTokens = 0, latency = 0;

        // One iteration is one completion. The budget is enforced here and nowhere else,
        // so there is exactly one place an unbounded agent loop could come from.
        for (int i = 1; i <= request.maxIterations(); i++) {
            var response = client.complete(messages, null, false, toolSchemas, request.overrides());
            promptTokens += or0(response.promptTokens());
            completionTokens += or0(response.completionTokens());
            latency += response.latencyMs();

            if (!response.wantsTools()) {
                return new ToolResult(response.content(), calls, i, false, client.model(),
                        new TokenUsage(promptTokens, completionTokens, latency, false));
            }

            messages.add(assistantToolCallMessage(response));
            for (var call : response.toolCalls()) {
                String result = invoke(byName, call);
                calls.add(new ToolSpec.Call(call.name(), argsOf(call), result));
                messages.add(Map.of("role", "tool", "tool_call_id", call.id(),
                        "name", call.name(), "content", result));
            }
        }

        // Budget spent. Returns what happened rather than a conclusion — a partial
        // conversation read as a verdict is how an unfinished check looks like a pass.
        log.warn("Tool loop for role {} exhausted its {} iteration budget after {} tool call(s)",
                request.role(), request.maxIterations(), calls.size());
        return new ToolResult(null, calls, request.maxIterations(), true, client.model(),
                new TokenUsage(promptTokens, completionTokens, latency, false));
    }

    private String invoke(Map<String, ToolSpec> byName, ChatCompletionsClient.ToolCall call) {
        ToolSpec spec = byName.get(call.name());
        if (spec == null) {
            // Tell the model what it may actually call rather than erroring. Models
            // recover from this in one turn; an exception ends the conversation.
            return "No such tool: " + call.name() + ". Available: " + String.join(", ", byName.keySet());
        }
        try {
            return spec.handler().apply(argsOf(call));
        } catch (RuntimeException e) {
            return "Tool " + call.name() + " failed: " + e.getMessage();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> argsOf(ChatCompletionsClient.ToolCall call) {
        try {
            return json.readValue(call.argumentsJson(), Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private Map<String, Object> assistantToolCallMessage(ChatCompletionsClient.Response response) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("role", "assistant");
        msg.put("content", response.content() == null ? "" : response.content());
        msg.put("tool_calls", response.toolCalls().stream().map(tc -> Map.of(
                "id", tc.id(), "type", "function",
                "function", Map.of("name", tc.name(), "arguments", tc.argumentsJson()))).toList());
        return msg;
    }

    // --- Role resolution ----------------------------------------------------

    private List<ChatCompletionsClient> usableSlots(LlmRole role) {
        List<ChatCompletionsClient> found = props.slotsFor(role).stream()
                .map(clients::get).filter(java.util.Objects::nonNull).toList();
        if (found.isEmpty()) {
            throw new LlmException(
                    "No usable model slot for role " + role + ". Configured: "
                            + props.slotsFor(role) + "; usable: " + clients.keySet(),
                    new LlmException.LlmRoleFailure(role.name(), List.of("no usable slot")));
        }
        return found;
    }

    private ChatCompletionsClient firstUsable(LlmRole role) {
        return usableSlots(role).get(0);
    }

    private static int or0(Integer i) {
        return i == null ? 0 : i;
    }

    /**
     * Reconciling what several slots read.
     *
     * <p>Majority per field; ties go to the first configured slot. Aggregate confidence is
     * the <em>lowest</em> among the slots that agreed, so "everyone agreed and everyone was
     * unsure" reads as low confidence rather than as unanimity.
     */
    private static final class Consensus {

        static VisionResult of(List<VisionResult.SlotResult> good, List<VisionResult.SlotResult> all) {
            if (good.size() == 1) {
                var only = good.get(0);
                return new VisionResult(only.fields(), confidenceFor(only.fields()),
                        Map.of(), List.of(), all, sumUsage(all));
            }

            Map<String, Object> agreed = new LinkedHashMap<>();
            Map<String, VisionResult.Confidence> confidence = new LinkedHashMap<>();

            List<String> keys = good.stream().flatMap(r -> r.fields().keySet().stream()).distinct().toList();
            for (String key : keys) {
                Map<Object, Integer> votes = new LinkedHashMap<>();
                for (var slot : good) {
                    Object v = slot.fields().get(key);
                    if (v != null) votes.merge(v, 1, Integer::sum);
                }
                if (votes.isEmpty()) continue;

                var winner = votes.entrySet().stream()
                        .max(Comparator.comparingInt(Map.Entry::getValue))
                        .orElseThrow();
                agreed.put(key, winner.getKey());
                confidence.put(key, level(winner.getValue(), good.size()));
            }
            return new VisionResult(agreed, confidence, Map.of(), List.of(), all, sumUsage(all));
        }

        // A single slot cannot corroborate anything, so nothing it says is HIGH. Reading
        // one model's output as certain is how a confident extraction error survives review.
        private static Map<String, VisionResult.Confidence> confidenceFor(Map<String, Object> fields) {
            Map<String, VisionResult.Confidence> out = new LinkedHashMap<>();
            fields.keySet().forEach(k -> out.put(k, VisionResult.Confidence.MED));
            return out;
        }

        private static VisionResult.Confidence level(int agreeing, int total) {
            if (agreeing >= 3) return VisionResult.Confidence.HIGH;
            if (agreeing >= 2) return VisionResult.Confidence.MED;
            return VisionResult.Confidence.LOW;
        }

        private static TokenUsage sumUsage(List<VisionResult.SlotResult> all) {
            int in = 0, out = 0, ms = 0;
            for (var r : all) {
                if (r.usage() == null) continue;
                in += or0(r.usage().promptTokens());
                out += or0(r.usage().completionTokens());
                // Slots run concurrently, so wall clock is the slowest, not the sum.
                ms = Math.max(ms, or0(r.usage().latencyMs()));
            }
            return new TokenUsage(in, out, ms, false);
        }
    }
}
