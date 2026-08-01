package com.tb.helix.harness.llm;

import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.doc.RenderSpec;
import com.tb.helix.harness.llm.backend.Completion;
import com.tb.helix.harness.llm.backend.Content;
import com.tb.helix.harness.llm.backend.Exchange;
import com.tb.helix.harness.llm.backend.ModelBackend;
import com.tb.helix.harness.llm.backend.ModelHandle;
import com.tb.helix.harness.llm.backend.ToolCall;
import com.tb.helix.harness.llm.backend.Turn;
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
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The one path to a model, and everything that is true of a model call whoever answers it.
 *
 * <p>Roles in, answers out. Which provider, which model, how many vote, and now <em>which
 * backend</em> — all configuration. Nothing above this line knows a vendor or a framework
 * exists.
 *
 * <p><b>What lives here rather than in a backend, and why.</b> Each of these is
 * provider-neutral, and each of them is a thing the system would quietly lose if a new
 * integration had to remember it:
 *
 * <ul>
 *   <li><b>The spend ledger and the run-log events.</b> Every attempt on every handle, with its
 *       tokens and its latency, whether it succeeded or not. A ledger with a hole in it is worse
 *       than no ledger — it reads as a run that was cheaper than it was.
 *   <li><b>The vision consensus.</b> Several models reading the same pages and voting field by
 *       field, with what each one said kept. A backend picks one model; the redundancy is ours.
 *   <li><b>The tool budget.</b> One iteration is one completion, the cap is enforced in exactly
 *       one loop, and a conversation that runs out returns what happened rather than a
 *       conclusion. The predecessor bypassed a framework's tool execution to get this back; it
 *       is not going behind a framework again.
 *   <li><b>JSON salvage.</b> A model told to emit JSON still wraps it in prose, and a model with
 *       reasoning on leaks the reasoning. Lifting the object back out is the same problem for
 *       every provider.
 * </ul>
 *
 * <p><b>How a role finds a model.</b> {@code helix.models.roles} names handles in order; the
 * gateway asks each {@link ModelBackend} whether a name is theirs and the first to claim it
 * wins. So the ordering authority stays in one config file, the first-named handle is still the
 * consensus tie-breaker, and moving a role to a different backend is a line of YAML.
 */
@Component
public class StandardLlmGateway implements LlmGateway {

    private static final Logger log = LoggerFactory.getLogger(StandardLlmGateway.class);

    private final List<ModelBackend> backends;
    private final LlmProperties props;
    private final RenderProperties render;
    private final ObjectMapper json;
    private final ModelCallLog calls;
    private final EventBus events;
    private final ExecutorService slotPool = Executors.newVirtualThreadPerTaskExecutor();

    /** A handle and the backend that owns it. Resolved per call; nothing is cached. */
    private record Bound(ModelBackend backend, ModelHandle handle) {
    }

    public StandardLlmGateway(List<ModelBackend> backends, LlmProperties props,
                              RenderProperties render, ObjectMapper json,
                              ModelCallLog calls, EventBus events) {
        this.backends = List.copyOf(backends);
        this.props = props;
        this.render = render;
        this.json = json;
        this.calls = calls;
        this.events = events;

        log.info("Model backends: {}", backends.stream().map(ModelBackend::name).toList());
        props.roles().forEach((role, names) -> {
            List<String> missing = names.stream().filter(n -> find(n).isEmpty()).toList();
            // A warning, not a failure: the service must still boot for governance work with no
            // keys configured. The failure comes when the role is actually used.
            if (!missing.isEmpty()) log.warn("Role '{}' names unusable handle(s) {}", role, missing);
            // Two backends answering to one name is a configuration mistake, and letting
            // whichever bean happened to be registered first win silently would make which
            // model answered depend on classpath order.
            names.forEach(n -> {
                List<String> claimants = backends.stream()
                        .filter(b -> b.handle(n).isPresent()).map(ModelBackend::name).toList();
                if (claimants.size() > 1) {
                    log.error("Handle '{}' is claimed by more than one backend {} — the first wins, "
                            + "which is not something to leave to chance", n, claimants);
                }
            });
        });
    }

    // --- Text ---------------------------------------------------------------

    @Override
    public TextResult complete(TextRequest request) {
        Bound bound = first(request.role());
        Exchange exchange = Exchange.of(request.role(), request.system(), request.user(),
                request.jsonOutput(), request.maxTokens(), request.overrides());

        long began = System.currentTimeMillis();
        try {
            Completion response = bound.backend().call(bound.handle(), exchange);

            record(bound, request.role(), ModelCallLog.Kind.TEXT, ModelCallLog.Status.OK,
                    response.promptTokens(), response.completionTokens(), response.cachedPromptTokens(),
                    response.latencyMs(), null, null);

            return new TextResult(response.text(), response.raw(), bound.handle().model(),
                    new TokenUsage(response.promptTokens(), response.completionTokens(),
                            response.latencyMs(), false));

        } catch (RuntimeException e) {
            // A failure costs latency and no tokens, so it leaves no trace in a token
            // ledger — and it is the row somebody looking into a slow run wants first.
            record(bound, request.role(), ModelCallLog.Kind.TEXT, statusOf(e),
                    0, 0, 0, (int) (System.currentTimeMillis() - began), e.getMessage(), null);
            throw e;
        }
    }

    // --- Vision -------------------------------------------------------------

    @Override
    public VisionResult read(VisionRequest request) {
        List<Bound> slots = resolve(request.role());

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
                .map(bound -> CompletableFuture.supplyAsync(
                        () -> CallScope.bind(scope, () -> readOne(bound, request)), slotPool))
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

    private VisionResult.SlotResult readOne(Bound bound, VisionRequest request) {
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
            // Expressed as an ordered list of content parts, which is why Content exists:
            // it makes the ordering this gateway's decision rather than something each
            // backend re-decides when it assembles a request.
            //
            // This does not touch DerivationKey: that hashes the prompt and the render
            // params, not the message order, so existing extract.doc entries stay valid.
            //
            // Whether the provider actually caches image content is not something to
            // assume. The backend reports prompt_tokens_details.cached_tokens into
            // model_call.cached_in — read that column.
            List<Content> parts = new ArrayList<>(request.pages().size() + 1);
            for (byte[] page : request.pages()) parts.add(Content.Image.png(page));
            parts.add(new Content.Text(request.prompt() + pageKey(request)));

            Exchange exchange = new Exchange(request.role(), List.of(new Turn.User(parts)),
                    List.of(), true, null, request.overrides());
            Completion response = bound.backend().call(bound.handle(), exchange);

            Map<String, Object> fields = parseFields(response.text());
            record(bound, request.role(), ModelCallLog.Kind.VISION, ModelCallLog.Status.OK,
                    response.promptTokens(), response.completionTokens(), response.cachedPromptTokens(),
                    response.latencyMs(), null, request);

            return new VisionResult.SlotResult(bound.handle().id(), bound.handle().model(), fields,
                    response.raw(), false, null,
                    new TokenUsage(response.promptTokens(), response.completionTokens(),
                            response.latencyMs(), false));

        } catch (RuntimeException e) {
            log.warn("Vision slot {} failed: {}", bound.handle().id(), e.toString());
            // Per slot, not per read. Three slots where one always times out is a fact about
            // that slot, and a read recorded as a single success would hide it completely.
            record(bound, request.role(), ModelCallLog.Kind.VISION, statusOf(e),
                    0, 0, 0, (int) (System.currentTimeMillis() - began), e.getMessage(), request);
            return new VisionResult.SlotResult(bound.handle().id(), bound.handle().model(), Map.of(),
                    null, true, e.getMessage(), new TokenUsage(0, 0, 0, false));
        }
    }

    /**
     * Writes down what one attempt cost.
     *
     * <p>Here rather than in a backend because every path through this class ends in a model
     * round trip, and a ledger with a hole in it is worse than no ledger — it reads as a run
     * that was cheaper than it was. A backend cannot forget to do this, because a backend has
     * never been asked to.
     *
     * <p>The top-level event fields stay short (model, tokens, ms) so the run log one-liner
     * stays readable. Everything an officer clicks for — dpi, long-edge, page bytes,
     * temperature — sits under {@code detail}.
     *
     * @param vision the request when this was a vision call; null for text
     */
    private void record(Bound bound, LlmRole role, ModelCallLog.Kind kind,
                        ModelCallLog.Status status, Integer in, Integer out, Integer cachedIn,
                        Integer ms, String error, VisionRequest vision) {
        var scope = CallScope.current();
        ModelHandle handle = bound.handle();

        // On the tape as well as in the ledger. The ledger answers "what did this run
        // spend"; the tape answers "what was it doing at 17:26:14", and a five-second gap
        // with nothing in it is the shape of a problem nobody can diagnose later.
        if (scope.caseId() != null) {
            Map<String, Object> e = new LinkedHashMap<>();
            e.put("stage", scope.stage());
            e.put("step", scope.step());
            e.put("model", handle.model());
            e.put("slot", handle.id());
            e.put("role", role == null ? null : role.name().toLowerCase());
            e.put("kind", kind.name());
            e.put("status", status.name());
            e.put("tokensIn", in == null ? 0 : in);
            e.put("tokensOut", out == null ? 0 : out);
            // Only when there was one. A zero here would read as "the prompt cache
            // missed", which is a claim about a provider that may not have one.
            if (cachedIn != null && cachedIn > 0) e.put("tokensCachedIn", cachedIn);
            e.put("ms", ms == null ? 0 : ms);
            Map<String, Object> detail = callDetail(bound, kind, vision);
            if (!detail.isEmpty()) e.put("detail", detail);
            e.values().removeIf(Objects::isNull);
            events.publish(HelixEvent.of(scope.caseId(), HelixEvent.LLM_CALL, e));
        }

        calls.record(new ModelCallLog.Call(
                scope.caseId(), scope.stage(), scope.step(),
                role == null ? null : role.name().toLowerCase(),
                handle.id(), handle.model(), bound.backend().name(),
                kind, status, 1,
                in == null ? 0 : in, out == null ? 0 : out, cachedIn == null ? 0 : cachedIn,
                ms, null, error));
    }

    /**
     * What the run-log expansion shows — handle knobs always, render knobs on vision.
     *
     * <p>DPI and long-edge come from {@link RenderProperties} for the role, which is the
     * same profile Interpret used to rasterise. Measuring the PNG bytes on the request
     * says what actually went on the wire, including after the long-edge cap.
     */
    private Map<String, Object> callDetail(Bound bound, ModelCallLog.Kind kind,
                                           VisionRequest vision) {
        ModelHandle handle = bound.handle();
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("temperature", handle.temperature());
        d.put("maxTokens", handle.maxTokens());
        // Null for an in-process backend, and then simply absent from the panel rather than
        // shown as an empty row.
        d.put("baseUrl", handle.endpoint());
        d.put("backend", bound.backend().name());
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
        d.values().removeIf(Objects::isNull);
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
        Bound bound = first(request.role());
        Map<String, ToolSpec> byName = new HashMap<>();
        request.tools().forEach(t -> byName.put(t.name(), t));

        List<Turn> turns = new ArrayList<>();
        if (request.system() != null) turns.add(new Turn.System(request.system()));
        turns.add(Turn.ask(request.user()));

        List<ToolSpec.Call> made = new ArrayList<>();
        int promptTokens = 0, completionTokens = 0, latency = 0;

        // One iteration is one completion. The budget is enforced here and nowhere else,
        // so there is exactly one place an unbounded agent loop could come from — and a
        // backend is never handed the loop, only the next single exchange in it.
        for (int i = 1; i <= request.maxIterations(); i++) {
            Exchange exchange = new Exchange(request.role(), List.copyOf(turns), request.tools(),
                    false, null, request.overrides());
            Completion response = bound.backend().call(bound.handle(), exchange);
            promptTokens += or0(response.promptTokens());
            completionTokens += or0(response.completionTokens());
            latency += response.latencyMs();
            record(bound, request.role(), ModelCallLog.Kind.TOOL, ModelCallLog.Status.OK,
                    response.promptTokens(), response.completionTokens(),
                    response.cachedPromptTokens(), response.latencyMs(), null, null);

            if (!response.wantsTools()) {
                return new ToolResult(response.text(), made, i, false, bound.handle().model(),
                        new TokenUsage(promptTokens, completionTokens, latency, false));
            }

            turns.add(new Turn.Assistant(response.text(), response.toolCalls()));
            for (ToolCall call : response.toolCalls()) {
                String result = invoke(byName, call);
                made.add(new ToolSpec.Call(call.name(), argsOf(call), result));
                turns.add(new Turn.ToolResult(call.id(), call.name(), result));
            }
        }

        // Budget spent. Returns what happened rather than a conclusion — a partial
        // conversation read as a verdict is how an unfinished check looks like a pass.
        log.warn("Tool loop for role {} exhausted its {} iteration budget after {} tool call(s)",
                request.role(), request.maxIterations(), made.size());
        return new ToolResult(null, made, request.maxIterations(), true, bound.handle().model(),
                new TokenUsage(promptTokens, completionTokens, latency, false));
    }

    private String invoke(Map<String, ToolSpec> byName, ToolCall call) {
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
    private Map<String, Object> argsOf(ToolCall call) {
        try {
            return json.readValue(call.argumentsJson(), Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    // --- Role resolution ----------------------------------------------------

    /** The first backend that claims this handle name. */
    private java.util.Optional<Bound> find(String id) {
        for (ModelBackend backend : backends) {
            var handle = backend.handle(id);
            if (handle.isPresent()) return java.util.Optional.of(new Bound(backend, handle.get()));
        }
        return java.util.Optional.empty();
    }

    private List<Bound> resolve(LlmRole role) {
        List<String> names = props.slotsFor(role);
        List<Bound> found = names.stream().map(this::find)
                .filter(java.util.Optional::isPresent).map(java.util.Optional::get).toList();
        if (found.isEmpty()) {
            throw new LlmException(
                    "No usable model for role " + role + ". Configured: " + names
                            + "; backends: " + backends.stream().map(ModelBackend::name).toList(),
                    new LlmException.LlmRoleFailure(role.name(), List.of("no usable handle")));
        }
        return found;
    }

    private Bound first(LlmRole role) {
        return resolve(role).get(0);
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
