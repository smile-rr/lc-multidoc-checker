package com.lc.v2.checker.stage.parse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.BBox;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.common.FieldValue;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.document.OffSchemaItem;
import com.lc.v2.checker.infra.cache.CacheKey;
import com.lc.v2.checker.infra.cache.VisionExtractCache;
import com.lc.v2.checker.infra.config.ExtractorSlotConfig;
import com.lc.v2.checker.infra.config.ExtractorSlotConfig.SlotEntry;
import com.lc.v2.checker.infra.config.ExtractorSlotProperties;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.observability.TracedCall;
import com.lc.v2.checker.infra.observability.TracingAsync;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Parallel multi-slot VLM extraction for all presented doc types.
 *
 * <p>Up to 4 slots (slot-1 through slot-4); config via vision-llm.slot-N.* / VISION_N_* env vars.
 * Slots fire in parallel; consensus = majority vote; slot-1 wins on tie.
 *
 * <p>Provider-specific request adaptation:
 * Qwen-family models receive {@code response_format: json_object} and {@code enable_thinking: false}
 * at the top level of the request body. Other providers (MiniMax, GLM, Kimi, etc.) skip these
 * fields to avoid 400 errors.
 */
@Service
public class VisionExtractService {

    private static final Logger log = LoggerFactory.getLogger(VisionExtractService.class);

    private final ExtractorSlotConfig slotConfig;
    private final DocTypeRegistry docTypeRegistry;
    private final ObjectMapper objectMapper;
    private final Tracer tracer;
    private final TracingAsync tracingAsync;
    private final VisionExtractCache cache;

    @Value("${vision.cache.enabled:true}")
    private boolean cacheEnabled;

    @Value("${vision.cache.request-shape-version:1}")
    private int requestShapeVersion;

    /** Self-injection so the @TracedCall aspect actually fires on runSlot. */
    @Lazy @Autowired private VisionExtractService self;

    public VisionExtractService(ExtractorSlotConfig slotConfig, DocTypeRegistry docTypeRegistry,
                                 Tracer tracer, TracingAsync tracingAsync,
                                 VisionExtractCache cache) {
        this.slotConfig = slotConfig;
        this.docTypeRegistry = docTypeRegistry;
        this.objectMapper = new ObjectMapper();
        this.tracer = tracer;
        this.tracingAsync = tracingAsync;
        this.cache = cache;
    }

    /**
     * Extract a single document using all enabled slots in parallel.
     * Returns a DocumentExtract with consensus envelope and per-slot raw results.
     *
     * @param sessionId  optional — when non-null, fine-grained ExtractionProgress events are emitted
     * @param eventBus   optional — required when sessionId is non-null
     */
    public DocumentExtract extract(DocType docType, byte[] pdfBytes, String filename,
                                    String sessionId, PipelineEventBus eventBus) {
        var entryOpt = docTypeRegistry.byDocType(docType);
        if (entryOpt.isEmpty() || entryOpt.get().extractionPrompt() == null) {
            log.warn("[VisionExtract] No extraction prompt for docType={}", docType);
            return DocumentExtract.empty(docType, filename);
        }

        String promptPath = entryOpt.get().extractionPrompt();
        String promptText = loadPrompt(promptPath);
        if (promptText == null) {
            log.warn("[VisionExtract] Prompt not found: {}", promptPath);
            return DocumentExtract.empty(docType, filename);
        }

        List<SlotEntry> slots = slotConfig.enabledSlots();
        if (slots.isEmpty()) {
            log.warn("[VisionExtract] No enabled vision slots for docType={}", docType);
            return DocumentExtract.empty(docType, filename);
        }

        String pdfSha256 = CacheKey.sha256Hex(pdfBytes);
        String promptSha256 = CacheKey.sha256Hex(promptText);

        // Precompute per-slot cache key + lookup. If all slots hit, skip PDF render entirely.
        Map<String, String> slotKey = new LinkedHashMap<>();
        Map<String, VisionExtractCache.Hit> slotHit = new LinkedHashMap<>();
        for (SlotEntry slot : slots) {
            ExtractorSlotProperties p = slot.props();
            String key = CacheKey.compose(pdfSha256, promptSha256, p.getModel(), p.getBaseUrl(),
                    p.getRenderDpi(), p.getMaxPages(), p.getMaxLongEdgePx(), requestShapeVersion);
            slotKey.put(slot.sourceName(), key);
            if (cacheEnabled) {
                VisionExtractCache.Hit hit = cache.lookup(key);
                if (hit != null) slotHit.put(slot.sourceName(), hit);
            }
        }
        boolean allHit = !slotHit.isEmpty() && slotHit.size() == slots.size();

        ExtractorSlotProperties renderSlot = slots.get(0).props();
        List<String> base64Pages;
        int renderedPages;
        if (allHit) {
            log.info("[VisionExtract] all {} slot(s) cache-hit for {}; skipping render+HTTP",
                    slots.size(), filename);
            base64Pages = List.of();
            renderedPages = 0;
        } else {
            emit(sessionId, eventBus, docType.name(), "render", "rendering_pdf");
            base64Pages = renderPdfToBase64(pdfBytes, renderSlot.getRenderDpi(), renderSlot.getMaxPages());
            if (base64Pages.isEmpty()) {
                log.warn("[VisionExtract] PDF rendering produced no pages for {}", filename);
                emit(sessionId, eventBus, docType.name(), "render", "render_failed");
                return DocumentExtract.empty(docType, filename);
            }
            emit(sessionId, eventBus, docType.name(), "render", "rendered_" + base64Pages.size() + "_pages");
            renderedPages = base64Pages.size();
        }

        // Run all enabled slots in parallel; slot source name = <model>_<N>.
        // TracingAsync re-attaches the current span (the "parse" stage span)
        // on each worker thread so the @TracedCall("vision.generate") aspect
        // on runSlot opens its child span under the right parent.
        Map<String, CompletableFuture<FieldEnvelope>> futures = new LinkedHashMap<>();
        for (SlotEntry slot : slots) {
            String sourceName = slot.sourceName();
            String key = slotKey.get(sourceName);
            VisionExtractCache.Hit hit = slotHit.get(sourceName);
            if (hit != null) {
                emit(sessionId, eventBus, docType.name(), sourceName, "cache_hit");
                FieldEnvelope cached = parseResponse(hit.rawResponse());
                cache.incrementHit(key);
                futures.put(sourceName, CompletableFuture.completedFuture(cached));
                continue;
            }
            emit(sessionId, eventBus, docType.name(), sourceName, "calling_" + slot.props().getModel());
            futures.put(sourceName, tracingAsync.supplyAsync(
                    () -> self.runSlot(sourceName, slot.props(), base64Pages, promptText, docType,
                            sessionId, eventBus, filename, pdfSha256, promptSha256, key)));
        }

        // Collect results; per-slot timeout from config
        Map<String, FieldEnvelope> bySlot = new LinkedHashMap<>();
        for (var entry : futures.entrySet()) {
            try {
                // Use the longest timeout among active slots (slot-1 may have a longer VLM timeout)
                long timeoutSecs = slots.stream()
                        .filter(s -> s.sourceName().equals(entry.getKey()))
                        .findFirst()
                        .map(s -> (long) s.props().getTimeoutSeconds())
                        .orElse(120L);
                FieldEnvelope result = entry.getValue().get(timeoutSecs, TimeUnit.SECONDS);
                if (result != null) {
                    bySlot.put(entry.getKey(), result);
                    emit(sessionId, eventBus, docType.name(), entry.getKey(), "complete");
                } else {
                    emit(sessionId, eventBus, docType.name(), entry.getKey(), "no_result");
                }
            } catch (Exception e) {
                log.error("[VisionExtract] Slot {} failed for {}: {}", entry.getKey(), filename, e.getMessage());
                emit(sessionId, eventBus, docType.name(), entry.getKey(), "failed:" + truncate(e.getMessage()));
            }
        }

        emit(sessionId, eventBus, docType.name(), "consensus", "merging_" + bySlot.size() + "_slots");
        String primarySourceName = slots.get(0).sourceName();
        FieldEnvelope consensus = computeConsensus(bySlot, primarySourceName);
        DocumentExtract.ExtractionConfidence confidence = computeConfidence(bySlot);
        List<OffSchemaItem> offSchema = extractOffSchemaItems(bySlot.get(primarySourceName));

        return new DocumentExtract(docType, consensus, bySlot, confidence, offSchema, filename, null, renderedPages);
    }

    /** Backwards-compatible overload (no progress emission). */
    public DocumentExtract extract(DocType docType, byte[] pdfBytes, String filename) {
        return extract(docType, pdfBytes, filename, null, null);
    }

    private static void emit(String sessionId, PipelineEventBus bus, String docType, String slot, String status) {
        if (sessionId == null || bus == null) return;
        bus.extractionProgress(sessionId, docType, slot, status);
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() <= 80 ? s : s.substring(0, 80) + "…";
    }

    @TracedCall(value = "vision.generate", tags = {"gen_ai.operation.name=chat"})
    public FieldEnvelope runSlot(String sourceName, ExtractorSlotProperties slot,
                           List<String> base64Pages, String promptText, DocType docType,
                           String sessionId, PipelineEventBus eventBus, String docName,
                           String pdfSha256, String promptSha256, String cacheKey) {
        // The @TracedCall aspect has opened the span and attached it as the
        // current scope. Set dynamic tags via tracer.currentSpan() — values
        // depending on per-slot args / response can't live on the annotation.
        Span span = tracer.currentSpan();
        if (span != null) {
            span.tag("gen_ai.system", providerOf(slot.getBaseUrl()));
            span.tag("gen_ai.request.model", String.valueOf(slot.getModel()));
            span.tag("doc_type", docType.name());
            span.tag("doc_name", docName == null ? "" : docName);
            span.tag("slot", sourceName);
            if (sessionId != null) {
                span.tag("session.id", sessionId);
                span.tag("langfuse.session.id", sessionId);
                span.tag("langfuse.trace.name",
                        com.lc.v2.checker.infra.observability.TraceNames.forSession(sessionId));
            }
            span.tag("input.pages", String.valueOf(base64Pages.size()));
            // Prompt text only (image bytes excluded — too large for traces).
            span.tag("input.value", trimForTrace(promptText));
            span.tag("gen_ai.prompt", trimForTrace(promptText));
        }
        log.debug("[VisionExtract] slot={} docType={}", sourceName, docType);
        try {
            String responseJson = callVlm(slot, base64Pages, promptText);
            emit(sessionId, eventBus, docType.name(), sourceName, "parsing_response");
            if (span != null) tagUsageAndOutput(span, responseJson);
            FieldEnvelope env = parseResponse(responseJson);
            if (cacheEnabled && cacheKey != null && !env.fields().isEmpty()) {
                storeInCache(cacheKey, pdfSha256, promptSha256, slot, responseJson, env);
            }
            return env;
        } catch (Exception e) {
            // Aspect tags `error` from the thrown message; we just log + swallow
            // so the slot fails soft (consensus survives missing slots).
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            log.error("[VisionExtract] slot={} error: {} (root={}: {})",
                    sourceName, e.getMessage(), root.getClass().getName(), root.getMessage(), e);
            if (span != null) span.tag("error", String.valueOf(e.getMessage()));
            return null;
        }
    }

    private static final int TRACE_VALUE_MAX = 8000;

    private static String trimForTrace(String s) {
        if (s == null) return "";
        return s.length() <= TRACE_VALUE_MAX ? s : s.substring(0, TRACE_VALUE_MAX) + "…";
    }

    /**
     * Read OpenAI-compatible {@code usage} + {@code choices[0].message.content} from the
     * raw response and surface them on the span as Langfuse-friendly attributes
     * (input/output bodies + token counts). Best-effort: any parse failure just leaves
     * the tags off.
     */
    private void tagUsageAndOutput(Span span, String responseJson) {
        if (responseJson == null) return;
        try {
            JsonNode root = objectMapper.readTree(responseJson);
            JsonNode usage = root.path("usage");
            if (usage.isObject()) {
                long pt = usage.path("prompt_tokens").asLong(-1);
                long ct = usage.path("completion_tokens").asLong(-1);
                long tt = usage.path("total_tokens").asLong(-1);
                if (pt >= 0) {
                    span.tag("gen_ai.usage.input_tokens", String.valueOf(pt));
                    span.tag("gen_ai.usage.prompt_tokens", String.valueOf(pt));
                }
                if (ct >= 0) {
                    span.tag("gen_ai.usage.output_tokens", String.valueOf(ct));
                    span.tag("gen_ai.usage.completion_tokens", String.valueOf(ct));
                }
                if (tt >= 0) {
                    span.tag("gen_ai.usage.total_tokens", String.valueOf(tt));
                }
            }
            String content = root.path("choices").path(0).path("message").path("content").asText("");
            if (!content.isEmpty()) {
                span.tag("output.value", trimForTrace(content));
                span.tag("gen_ai.completion", trimForTrace(content));
            }
            String finish = root.path("choices").path(0).path("finish_reason").asText(null);
            if (finish != null) span.tag("gen_ai.response.finish_reason", finish);
            String responseModel = root.path("model").asText(null);
            if (responseModel != null) span.tag("gen_ai.response.model", responseModel);
        } catch (Exception e) {
            log.debug("[VisionExtract] usage/output trace parse skipped: {}", e.getMessage());
        }
    }

    private static String providerOf(String baseUrl) {
        if (baseUrl == null) return "unknown";
        String s = baseUrl.toLowerCase();
        if (s.contains("dashscope")) return "qwen-bailian";
        if (s.contains("ollama") || s.contains(":11434")) return "ollama";
        if (s.contains("minimax")) return "minimax";
        if (s.contains("zhipu") || s.contains("glm")) return "glm";
        if (s.contains("moonshot") || s.contains("kimi")) return "kimi";
        return "openai-compatible";
    }

    private String callVlm(ExtractorSlotProperties slot, List<String> base64Pages, String promptText) {
        RestClient client = RestClient.builder()
                .baseUrl(slot.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + slot.getApiKey())
                .build();

        List<Map<String, Object>> contentParts = new ArrayList<>();
        contentParts.add(Map.of("type", "text", "text", promptText));
        for (String b64 : base64Pages) {
            contentParts.add(Map.of(
                    "type", "image_url",
                    "image_url", Map.of("url", "data:image/png;base64," + b64)));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", slot.getModel());
        body.put("messages", List.of(Map.of("role", "user", "content", contentParts)));
        body.put("max_tokens", 4096);

        // Qwen-family: add json_object response format + suppress thinking tokens.
        // Other providers (MiniMax, GLM, Kimi, Llama, etc.) reject these fields → skip.
        if (isQwenFamily(slot.getModel())) {
            body.put("response_format", Map.of("type", "json_object"));
            body.put("enable_thinking", false);
            // Determinism: same inputs ⇒ same output, so the cache layer is safe.
            body.put("temperature", 0);
        }

        return client.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class);
    }

    private static boolean isQwenFamily(String model) {
        return model != null && model.toLowerCase().startsWith("qwen");
    }

    private void storeInCache(String cacheKey, String pdfSha256, String promptSha256,
                              ExtractorSlotProperties slot, String responseJson, FieldEnvelope env) {
        try {
            Map<String, Object> envMap = new LinkedHashMap<>();
            envMap.put("fields", env.fields());
            envMap.put("extras", env.extras());
            String parsedEnvelopeJson = objectMapper.writeValueAsString(envMap);
            Object offSchemaRaw = env.extras().get("off_schema_items_raw");
            String offSchemaJson = offSchemaRaw == null ? null : offSchemaRaw.toString();

            Integer pt = null, ct = null, tt = null;
            try {
                JsonNode usage = objectMapper.readTree(responseJson).path("usage");
                if (usage.isObject()) {
                    if (usage.has("prompt_tokens")) pt = usage.path("prompt_tokens").asInt();
                    if (usage.has("completion_tokens")) ct = usage.path("completion_tokens").asInt();
                    if (usage.has("total_tokens")) tt = usage.path("total_tokens").asInt();
                }
            } catch (Exception ignore) {}

            cache.put(cacheKey, pdfSha256, promptSha256, slot.getModel(), slot.getBaseUrl(),
                    slot.getRenderDpi(), slot.getMaxPages(), slot.getMaxLongEdgePx(),
                    requestShapeVersion, responseJson, parsedEnvelopeJson, offSchemaJson,
                    pt, ct, tt);
        } catch (Exception e) {
            log.warn("[VisionExtract] cache put failed: {}", e.getMessage());
        }
    }

    private FieldEnvelope parseResponse(String responseJson) {
        try {
            JsonNode root = objectMapper.readTree(responseJson);
            String content = root.path("choices").path(0).path("message").path("content").asText();
            if (content == null || content.isBlank()) return FieldEnvelope.empty();
            JsonNode fields = objectMapper.readTree(content);
            FieldEnvelope.Builder builder = FieldEnvelope.builder();
            // Read raw_quotes + field_confidence side-channels (W2 provenance contract).
            JsonNode rawQuotes = fields.path("raw_quotes");
            JsonNode fieldConfs = fields.path("field_confidence");
            fields.fields().forEachRemaining(e -> {
                String key = e.getKey();
                if ("off_schema_items".equals(key)
                        || "raw_quotes".equals(key)
                        || "field_confidence".equals(key)) return;
                JsonNode v = e.getValue();
                if (v.isNull()) return;
                Object value = v.isTextual() ? v.asText() : (v.isNumber() ? (Object) v.numberValue() : v.toString());
                String quote = rawQuotes.has(key) ? rawQuotes.path(key).asText(null) : null;
                Double conf = fieldConfs.has(key) && fieldConfs.path(key).isNumber()
                        ? fieldConfs.path(key).asDouble() : null;
                if (quote != null || conf != null) {
                    builder.put(key, FieldValue.of(value, conf, quote));
                } else {
                    builder.put(key, value);
                }
            });
            if (fields.has("off_schema_items")) {
                builder.putExtra("off_schema_items_raw", fields.get("off_schema_items").toString());
            }
            return builder.build();
        } catch (Exception e) {
            log.warn("[VisionExtract] Failed to parse VLM response: {}", e.getMessage());
            return FieldEnvelope.empty();
        }
    }

    /** Consensus: majority vote per field; primarySourceName wins on tie. */
    private FieldEnvelope computeConsensus(Map<String, FieldEnvelope> bySlot, String primarySourceName) {
        if (bySlot.isEmpty()) return FieldEnvelope.empty();
        if (bySlot.size() == 1) return bySlot.values().iterator().next();

        var allKeys = bySlot.values().stream()
                .flatMap(e -> e.fields().keySet().stream())
                .collect(java.util.stream.Collectors.toSet());

        FieldEnvelope.Builder builder = FieldEnvelope.builder();
        for (String key : allKeys) {
            Map<Object, Integer> votes = new LinkedHashMap<>();
            for (var entry : bySlot.entrySet()) {
                Object v = entry.getValue().get(key);
                if (v != null) votes.merge(v, 1, Integer::sum);
            }
            int topVotes = votes.values().stream().max(Integer::compareTo).orElse(0);
            long topCount = votes.values().stream().filter(c -> c == topVotes).count();
            boolean tied = topCount > 1;

            Object winner;
            if (tied) {
                // Tiebreak by highest per-field confidence among tied candidates.
                Object best = null;
                double bestConf = -1.0;
                for (var entry : votes.entrySet()) {
                    if (entry.getValue() != topVotes) continue;
                    Object candidate = entry.getKey();
                    for (var slotEntry : bySlot.entrySet()) {
                        if (!candidate.equals(slotEntry.getValue().get(key))) continue;
                        FieldValue m = slotEntry.getValue().meta(key);
                        double c = (m != null && m.confidence() != null) ? m.confidence() : 0.0;
                        if (c > bestConf) { best = candidate; bestConf = c; }
                    }
                }
                winner = best;
                if (winner == null && bySlot.containsKey(primarySourceName)) {
                    winner = bySlot.get(primarySourceName).get(key);
                }
            } else {
                winner = votes.entrySet().stream()
                        .max(Map.Entry.comparingByValue())
                        .map(Map.Entry::getKey)
                        .orElse(null);
            }
            if (winner == null && bySlot.containsKey(primarySourceName)) {
                winner = bySlot.get(primarySourceName).get(key);
            }
            if (winner == null) continue;
            // Preserve provenance: pick FieldValue meta from the slot that voted for the winner
            // (prefer primary slot when it agrees).
            FieldValue meta = null;
            if (bySlot.containsKey(primarySourceName)
                    && winner.equals(bySlot.get(primarySourceName).get(key))) {
                meta = bySlot.get(primarySourceName).meta(key);
            }
            if (meta == null) {
                for (var entry : bySlot.entrySet()) {
                    if (winner.equals(entry.getValue().get(key))) {
                        FieldValue m = entry.getValue().meta(key);
                        if (m != null) { meta = m; break; }
                    }
                }
            }
            // Aggregate confidence across all slots that voted for the winner — take the min
            // so "everyone agreed but everyone was unsure" surfaces as low confidence.
            Double aggConf = null;
            for (var entry : bySlot.entrySet()) {
                if (!winner.equals(entry.getValue().get(key))) continue;
                FieldValue m = entry.getValue().meta(key);
                if (m == null || m.confidence() == null) continue;
                aggConf = (aggConf == null) ? m.confidence() : Math.min(aggConf, m.confidence());
            }
            if (meta != null) {
                if (aggConf != null && !aggConf.equals(meta.confidence())) {
                    builder.put(key, FieldValue.of(meta.value(), aggConf, meta.rawQuote()));
                } else {
                    builder.put(key, meta);
                }
            } else if (aggConf != null) {
                builder.put(key, FieldValue.of(winner, aggConf, null));
            } else {
                builder.put(key, winner);
            }
        }
        return builder.build();
    }

    private DocumentExtract.ExtractionConfidence computeConfidence(Map<String, FieldEnvelope> bySlot) {
        if (bySlot.size() >= 3) return DocumentExtract.ExtractionConfidence.HIGH;
        if (bySlot.size() == 2) return DocumentExtract.ExtractionConfidence.MED;
        return DocumentExtract.ExtractionConfidence.LOW;
    }

    private List<OffSchemaItem> extractOffSchemaItems(FieldEnvelope envelope) {
        if (envelope == null) return List.of();
        Object raw = envelope.extras().get("off_schema_items_raw");
        if (raw == null) return List.of();
        try {
            JsonNode arr = objectMapper.readTree(raw.toString());
            List<OffSchemaItem> items = new ArrayList<>();
            for (JsonNode node : arr) {
                List<String> tags = null;
                if (node.has("tags") && node.path("tags").isArray()) {
                    tags = new ArrayList<>();
                    for (JsonNode t : node.path("tags")) tags.add(t.asText());
                }
                BBox bbox = null;
                JsonNode bboxNode = node.path("bbox");
                if (bboxNode.isObject() && bboxNode.has("x")) {
                    bbox = new BBox(
                            bboxNode.has("x") ? bboxNode.path("x").asInt() : null,
                            bboxNode.has("y") ? bboxNode.path("y").asInt() : null,
                            bboxNode.has("w") ? bboxNode.path("w").asInt() : null,
                            bboxNode.has("h") ? bboxNode.path("h").asInt() : null);
                }
                items.add(new OffSchemaItem(
                        node.path("raw_quote").asText(null),
                        tags,
                        node.has("page") ? node.path("page").asInt() : null,
                        bbox,
                        node.has("confidence") ? node.path("confidence").asDouble() : null,
                        node.path("kind").asText(null),
                        node.path("value").asText(null),
                        node.path("field_hint").asText(null),
                        node.path("location").asText(null),
                        node.path("original").asText(null),
                        node.has("authenticated") ? node.path("authenticated").asBoolean() : null));
            }
            return List.copyOf(items);
        } catch (Exception e) {
            log.warn("[VisionExtract] Failed to parse off_schema_items: {}", e.getMessage());
            return List.of();
        }
    }

    private List<String> renderPdfToBase64(byte[] pdfBytes, int dpi, int maxPages) {
        List<String> pages = new ArrayList<>();
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDFRenderer renderer = new PDFRenderer(doc);
            int pageCount = Math.min(doc.getNumberOfPages(), maxPages);
            for (int i = 0; i < pageCount; i++) {
                BufferedImage image = renderer.renderImageWithDPI(i, dpi);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ImageIO.write(image, "PNG", baos);
                pages.add(Base64.getEncoder().encodeToString(baos.toByteArray()));
            }
        } catch (IOException e) {
            log.error("[VisionExtract] PDF render failed: {}", e.getMessage());
        }
        return pages;
    }

    private String loadPrompt(String promptPath) {
        try {
            ClassPathResource resource = new ClassPathResource("prompts/" + promptPath);
            try (InputStream in = resource.getInputStream()) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            log.error("[VisionExtract] Prompt not found: prompts/{}", promptPath);
            return null;
        }
    }
}
