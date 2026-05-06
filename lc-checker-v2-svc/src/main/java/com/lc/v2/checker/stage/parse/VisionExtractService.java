package com.lc.v2.checker.stage.parse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.document.OffSchemaItem;
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

    /** Self-injection so the @TracedCall aspect actually fires on runSlot. */
    @Lazy @Autowired private VisionExtractService self;

    public VisionExtractService(ExtractorSlotConfig slotConfig, DocTypeRegistry docTypeRegistry,
                                 Tracer tracer, TracingAsync tracingAsync) {
        this.slotConfig = slotConfig;
        this.docTypeRegistry = docTypeRegistry;
        this.objectMapper = new ObjectMapper();
        this.tracer = tracer;
        this.tracingAsync = tracingAsync;
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

        emit(sessionId, eventBus, docType.name(), "render", "rendering_pdf");
        ExtractorSlotProperties renderSlot = slots.get(0).props();
        List<String> base64Pages = renderPdfToBase64(pdfBytes, renderSlot.getRenderDpi(), renderSlot.getMaxPages());
        if (base64Pages.isEmpty()) {
            log.warn("[VisionExtract] PDF rendering produced no pages for {}", filename);
            emit(sessionId, eventBus, docType.name(), "render", "render_failed");
            return DocumentExtract.empty(docType, filename);
        }
        emit(sessionId, eventBus, docType.name(), "render", "rendered_" + base64Pages.size() + "_pages");

        // Run all enabled slots in parallel; slot source name = <model>_<N>.
        // TracingAsync re-attaches the current span (the "parse" stage span)
        // on each worker thread so the @TracedCall("vision.generate") aspect
        // on runSlot opens its child span under the right parent.
        Map<String, CompletableFuture<FieldEnvelope>> futures = new LinkedHashMap<>();
        for (SlotEntry slot : slots) {
            String sourceName = slot.sourceName();
            emit(sessionId, eventBus, docType.name(), sourceName, "calling_" + slot.props().getModel());
            futures.put(sourceName, tracingAsync.supplyAsync(
                    () -> self.runSlot(sourceName, slot.props(), base64Pages, promptText, docType,
                            sessionId, eventBus, filename)));
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

        return new DocumentExtract(docType, consensus, bySlot, confidence, offSchema, filename, null, base64Pages.size());
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
                           String sessionId, PipelineEventBus eventBus, String docName) {
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
            return parseResponse(responseJson);
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

    private FieldEnvelope parseResponse(String responseJson) {
        try {
            JsonNode root = objectMapper.readTree(responseJson);
            String content = root.path("choices").path(0).path("message").path("content").asText();
            if (content == null || content.isBlank()) return FieldEnvelope.empty();
            JsonNode fields = objectMapper.readTree(content);
            FieldEnvelope.Builder builder = FieldEnvelope.builder();
            fields.fields().forEachRemaining(e -> {
                if (!"off_schema_items".equals(e.getKey())) {
                    JsonNode v = e.getValue();
                    if (!v.isNull()) builder.put(e.getKey(), v.isTextual() ? v.asText() : v.toString());
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
            Object winner = votes.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(null);
            if (winner == null && bySlot.containsKey(primarySourceName)) {
                winner = bySlot.get(primarySourceName).get(key);
            }
            builder.put(key, winner);
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
                items.add(new OffSchemaItem(
                        node.path("kind").asText(null),
                        node.path("value").asText(null),
                        node.path("field_hint").asText(null),
                        node.path("location").asText(null),
                        node.path("original").asText(null),
                        node.has("authenticated") ? node.path("authenticated").asBoolean() : null,
                        node.has("page") ? node.path("page").asInt() : null,
                        node.has("confidence") ? node.path("confidence").asDouble() : null));
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
