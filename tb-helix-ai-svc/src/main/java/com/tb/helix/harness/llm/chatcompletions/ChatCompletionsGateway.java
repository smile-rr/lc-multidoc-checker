package com.tb.helix.harness.llm.chatcompletions;

import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.doc.RenderSpec;
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
import com.tb.helix.infra.cost.CallScope;
import com.tb.helix.infra.cost.ModelCallLog;
import com.tb.helix.infra.error.LlmException;
import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;

import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final RenderProperties render;
    private final ObjectMapper json;
    private final ModelCallLog calls;
    private final EventBus events;
    private final Map<String, ChatCompletionsClient> clients = new LinkedHashMap<>();
    private final ExecutorService slotPool = Executors.newVirtualThreadPerTaskExecutor();

    public ChatCompletionsGateway(LlmProperties props, RenderProperties render, ObjectMapper json,
                                  ModelCallLog calls, EventBus events) {
        this.props = props;
        this.render = render;
        this.json = json;
        this.calls = calls;
        this.events = events;
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

        long began = System.currentTimeMillis();
        try {
            var response = client.complete(messages, request.maxTokens(), request.jsonOutput(),
                    null, request.overrides());

            record(client, request.role(), ModelCallLog.Kind.TEXT, ModelCallLog.Status.OK,
                    response.promptTokens(), response.completionTokens(), response.cachedPromptTokens(),
                    response.latencyMs(), null, null);

            return new TextResult(response.content(), response.raw(), client.model(),
                    new TokenUsage(response.promptTokens(), response.completionTokens(),
                            response.latencyMs(), false));

        } catch (RuntimeException e) {
            // A failure costs latency and no tokens, so it leaves no trace in a token
            // ledger — and it is the row somebody looking into a slow run wants first.
            record(client, request.role(), ModelCallLog.Kind.TEXT, statusOf(e),
                    0, 0, 0, (int) (System.currentTimeMillis() - began), e.getMessage(), null);
            throw e;
        }
    }

    // --- Vision -------------------------------------------------------------

    @Override
    public VisionResult read(VisionRequest request) {
        List<ChatCompletionsClient> slots = usableSlots(request.role());

        // Slots run concurrently; each carries its own failure. A slot that dies is dropped
        // rather than failing the read — redundancy is the entire reason for having more
        // than one, and a three-slot consensus that silently became one must still be
        // visible, which is what SlotResult.failed carries.
        // Captured here and re-bound inside each task. The pool's threads are shared, so
        // whatever a stage bound on the calling thread is not there by the time a slot runs
        // — and the vision path is where the money goes, which makes it the one place
        // attribution must not quietly fall through to "no case".
        var scope = CallScope.capture();
        List<CompletableFuture<VisionResult.SlotResult>> futures = slots.stream()
                .map(client -> CompletableFuture.supplyAsync(
                        () -> CallScope.bind(scope, () -> readOne(client, request)), slotPool))
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

    /**
     * The bundle page each image is, appended to the instruction.
     *
     * <p>{@link VisionRequest#pageLabels()} existed and was never sent. Prompts asked the
     * model to mark pages "using the page numbers given with the images" and no page number
     * was ever given with an image, so every page marker in a layout dump was the model
     * counting from one — which is right only when the document starts the bundle.
     *
     * <p>It goes on the tail of the instruction rather than between the images, because the
     * images have to stay a contiguous identical prefix for the cache to see them as one.
     */
    private static String pageKey(VisionRequest request) {
        if (request.pageLabels().isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n\nThe images above are, in order, bundle page ");
        for (int i = 0; i < request.pageLabels().size(); i++) {
            if (i > 0) sb.append(i == request.pageLabels().size() - 1 ? " and " : ", ");
            sb.append(request.pageLabels().get(i));
        }
        return sb.append(". Cite these numbers, not their position in the list.\n").toString();
    }

    private VisionResult.SlotResult readOne(ChatCompletionsClient client, VisionRequest request) {
        long began = System.currentTimeMillis();
        try {
            // Images first, instruction last. This ordering is the money, not a style.
            //
            // A provider's prefix cache matches from the first content block. One document
            // is read three times — extract, extract.md, attest — over byte-identical
            // images, differing only in the instruction. With the instruction first, the
            // three requests diverge at block one and the image tokens, which are ~95% of
            // the input, can never be reused. Reversed, the later passes ride the prefix
            // the first one paid for.
            //
            // This does not touch DerivationKey: that hashes the prompt and the render
            // params, not the message order, so existing extract.doc entries stay valid.
            //
            // Whether the provider actually caches image content is not something to
            // assume. ChatCompletionsClient already parses prompt_tokens_details
            // .cached_tokens into model_call.cached_in — read that column.
            List<Map<String, Object>> parts = new ArrayList<>();
            for (byte[] page : request.pages()) {
                parts.add(Map.of("type", "image_url", "image_url",
                        Map.of("url", "data:image/png;base64," + Base64.getEncoder().encodeToString(page))));
            }
            parts.add(Map.of("type", "text", "text", request.prompt() + pageKey(request)));
            var response = client.complete(
                    List.of(Map.of("role", "user", "content", parts)),
                    null, true, null, request.overrides());

            Map<String, Object> fields = parseFields(response.content());
            record(client, request.role(), ModelCallLog.Kind.VISION, ModelCallLog.Status.OK,
                    response.promptTokens(), response.completionTokens(), response.cachedPromptTokens(),
                    response.latencyMs(), null, request);

            return new VisionResult.SlotResult(client.name(), client.model(), fields, response.raw(),
                    false, null,
                    new TokenUsage(response.promptTokens(), response.completionTokens(),
                            response.latencyMs(), false));

        } catch (RuntimeException e) {
            log.warn("Vision slot {} failed: {}", client.name(), e.toString());
            // Per slot, not per read. Three slots where one always times out is a fact about
            // that slot, and a read recorded as a single success would hide it completely.
            record(client, request.role(), ModelCallLog.Kind.VISION, statusOf(e),
                    0, 0, 0, (int) (System.currentTimeMillis() - began), e.getMessage(), request);
            return new VisionResult.SlotResult(client.name(), client.model(), Map.of(), null,
                    true, e.getMessage(), new TokenUsage(0, 0, 0, false));
        }
    }

    /**
     * Writes down what one attempt cost.
     *
     * <p>Here rather than at the call sites because every path through this class ends in a
     * provider round trip, and a ledger with a hole in it is worse than no ledger — it reads
     * as a run that was cheaper than it was.
     *
     * <p>The top-level event fields stay short (model, tokens, ms) so the run log one-liner
     * stays readable. Everything an officer clicks for — dpi, long-edge, page bytes,
     * temperature — sits under {@code detail}.
     *
     * @param vision the request when this was a vision call; null for text
     */
    private void record(ChatCompletionsClient client, LlmRole role, ModelCallLog.Kind kind,
                        ModelCallLog.Status status, Integer in, Integer out, Integer cachedIn,
                        Integer ms, String error, VisionRequest vision) {
        var scope = CallScope.current();

        // On the tape as well as in the ledger. The ledger answers "what did this run
        // spend"; the tape answers "what was it doing at 17:26:14", and a five-second gap
        // with nothing in it is the shape of a problem nobody can diagnose later.
        if (scope.caseId() != null) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("stage", scope.stage());
            e.put("step", scope.step());
            e.put("model", client.model());
            e.put("slot", client.name());
            e.put("role", role == null ? null : role.name().toLowerCase());
            e.put("kind", kind.name());
            e.put("status", status.name());
            e.put("tokensIn", in == null ? 0 : in);
            e.put("tokensOut", out == null ? 0 : out);
            // Only when there was one. A zero here would read as "the prompt cache
            // missed", which is a claim about a provider that may not have one.
            if (cachedIn != null && cachedIn > 0) e.put("tokensCachedIn", cachedIn);
            e.put("ms", ms == null ? 0 : ms);
            Map<String, Object> detail = callDetail(client, kind, vision);
            if (!detail.isEmpty()) e.put("detail", detail);
            e.values().removeIf(java.util.Objects::isNull);
            events.publish(HelixEvent.of(scope.caseId(), HelixEvent.LLM_CALL, e));
        }

        calls.record(new ModelCallLog.Call(
                scope.caseId(), scope.stage(), scope.step(),
                role == null ? null : role.name().toLowerCase(),
                client.name(), client.model(), null,
                kind, status, 1,
                in == null ? 0 : in, out == null ? 0 : out, cachedIn == null ? 0 : cachedIn,
                ms, null, error));
    }

    /**
     * What the run-log expansion shows — slot knobs always, render knobs on vision.
     *
     * <p>DPI and long-edge come from {@link RenderProperties} for the role, which is the
     * same profile Interpret used to rasterise. Measuring the PNG bytes on the request
     * says what actually went on the wire, including after the long-edge cap.
     */
    private Map<String, Object> callDetail(ChatCompletionsClient client, ModelCallLog.Kind kind,
                                           VisionRequest vision) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("temperature", client.temperature());
        d.put("maxTokens", client.maxTokens());
        d.put("baseUrl", client.baseUrl());
        if (kind == ModelCallLog.Kind.VISION && vision != null) {
            d.put("pages", vision.pages().size());
            long bytes = 0;
            for (byte[] page : vision.pages()) bytes += page == null ? 0 : page.length;
            d.put("imageBytes", bytes);
            if (!vision.pageLabels().isEmpty()) d.put("pageLabels", vision.pageLabels());
            String profile = vision.role().name().toLowerCase().replace('_', '-');
            // segment / extract share helix.render.profiles.*; others fall back mid.
            if (vision.role() == LlmRole.SEGMENT || vision.role() == LlmRole.EXTRACT) {
                RenderSpec spec = render.specFor(vision.role().name().toLowerCase());
                d.put("dpi", spec.dpi());
                d.put("maxLongEdgePx", spec.maxLongEdgePx());
                d.put("maxPages", spec.maxPages());
                d.put("renderProfile", profile);
            }
        }
        d.values().removeIf(java.util.Objects::isNull);
        return d;
    }

    /** A timeout is worth telling apart from a refusal: one is capacity, the other is us. */
    private static ModelCallLog.Status statusOf(RuntimeException e) {
        String s = String.valueOf(e).toLowerCase();
        return s.contains("timeout") || s.contains("timed out")
                ? ModelCallLog.Status.TIMEOUT
                : ModelCallLog.Status.FAILED;
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
