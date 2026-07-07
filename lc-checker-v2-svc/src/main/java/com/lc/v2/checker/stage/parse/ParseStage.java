package com.lc.v2.checker.stage.parse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.common.FieldValue;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 1 — Parse.
 *
 * <p>Vision extraction only — MT700 parse moved to SegmentationStage so the LC fields
 * are populated before the intake gate. By the time the officer reaches Parse,
 * the LC view shows real data; Continue triggers only the vision extraction.</p>
 *
 * <p>Vision extracts run sequentially per-doc in LC-review-priority order
 * (INV → BOL → PKL → BOE → BC → WC). Within each doc, enabled slots fire in
 * parallel; consensus = majority vote. Honours ctx.cancelled between docs.</p>
 */
@Component
public class ParseStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ParseStage.class);

    private final VisionExtractService visionExtractService;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;

    public ParseStage(VisionExtractService visionExtractService,
                      SessionStore sessionStore, ObjectMapper objectMapper) {
        this.visionExtractService = visionExtractService;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() { return "parse"; }

    @Override
    @PipelineStage
    public void execute(StageContext ctx) {
        log.info("[{}] ParseStage starting (vision only — LC already parsed in Intake)", ctx.sessionId);
        ctx.eventBus.stageStarted(ctx.sessionId, "parse");

        // Vision extraction in LC-review-priority order: INV → BOL → PKL →
        // BOE → BC → WC. DocType enum is declared in this order so ordinal works.
        List<DocType> toExtract = new ArrayList<>();
        for (DocType dt : ctx.uploadedDocBytes.keySet()) {
            if (dt != DocType.LC && dt != DocType.UNKNOWN) toExtract.add(dt);
        }
        toExtract.sort(java.util.Comparator.comparingInt(DocType::ordinal));

        if (!toExtract.isEmpty()) {
            extractAllDocTypes(ctx, toExtract);
        }

        ctx.eventBus.stageCompleted(ctx.sessionId, "parse",
                "lc=" + (ctx.lc != null) + " extracts=" + ctx.extracts.size());
        log.info("[{}] ParseStage complete: {} doc extracts", ctx.sessionId, ctx.extracts.size());
    }

    private void extractAllDocTypes(StageContext ctx, List<DocType> docTypes) {
        // Sequential in upload (= display) order. Within each doc, slots run in parallel.
        for (DocType dt : docTypes) {
            if (ctx.cancelled) {
                log.info("[{}] Parse cancelled — skipping {}", ctx.sessionId, dt);
                ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(), "primary", "cancelled");
                break;
            }
            byte[] pdfBytes = ctx.uploadedDocBytes.get(dt);
            String filename = ctx.uploadedDocNames.getOrDefault(dt, dt.name() + ".pdf");
            if (pdfBytes == null || pdfBytes.length == 0) {
                ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(), "primary", "skipped_empty");
                continue;
            }

            ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(), "primary", "queued");
            try {
                DocumentExtract extract = visionExtractService.extract(
                        dt, pdfBytes, filename, ctx.sessionId, ctx.eventBus);
                if (extract.bySlot().isEmpty()) {
                    // Total failure — every enabled slot returned null
                    sessionStore.updateDocumentStatusByType(ctx.sessionId, dt.name(), "FAILED");
                    ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(),
                            "consensus", "failed_all_slots");
                    log.error("[{}] Extraction failed for {}: no slots produced output", ctx.sessionId, dt);
                    continue;
                }
                ctx.extracts.put(dt, extract);
                sessionStore.updateDocumentStatusByType(ctx.sessionId, dt.name(), "EXTRACTED");
                persistExtract(ctx, dt, extract);
                ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(),
                        "consensus", extract.overallConfidence().name());
                log.info("[{}] Extracted {}: confidence={}",
                        ctx.sessionId, dt, extract.overallConfidence());
            } catch (Exception e) {
                sessionStore.updateDocumentStatusByType(ctx.sessionId, dt.name(), "FAILED");
                ctx.eventBus.extractionProgress(ctx.sessionId, dt.name(),
                        "consensus", "failed:" + truncate(e.getMessage()));
                log.error("[{}] Extraction failed for {}: {}", ctx.sessionId, dt, e.getMessage(), e);
            }
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() <= 120 ? s : s.substring(0, 120) + "…";
    }

    /**
     * Persist per-slot envelopes + the consensus row to pipeline_steps:
     *   - parse/extract:&lt;dt&gt;:&lt;slot&gt;   per-slot vision output
     *   - parse/consensus:&lt;dt&gt;           majority-vote consensus
     *
     * Read via {@code v_doc_extracts_consensus} / {@code v_doc_extracts_slots}.
     */
    private void persistExtract(StageContext ctx, DocType dt, DocumentExtract extract) {
        String docId = ctx.docIds.get(dt);
        if (docId == null) {
            log.warn("[{}] No docId for {} — extraction not persisted", ctx.sessionId, dt);
            return;
        }
        try {
            for (var entry : extract.bySlot().entrySet()) {
                String slot = entry.getKey();
                FieldEnvelope env = entry.getValue();
                Map<String, Object> stepResult = new java.util.LinkedHashMap<>();
                stepResult.put("doc_id", docId);
                stepResult.put("fields", serializeFields(env));
                stepResult.put("off_schema_items", java.util.List.of());
                sessionStore.upsertPipelineStep(ctx.sessionId, "parse",
                        "extract:" + dt.name() + ":" + slot,
                        "SUCCESS", objectMapper.writeValueAsString(stepResult),
                        null, null);
            }
            double overallConf = switch (extract.overallConfidence()) {
                case HIGH -> 0.95;
                case MED -> 0.80;
                case LOW -> 0.55;
            };
            Map<String, Object> consensusResult = new java.util.LinkedHashMap<>();
            consensusResult.put("doc_id", docId);
            consensusResult.put("fields", serializeFields(extract.consensus()));
            consensusResult.put("off_schema_items", extract.offSchemaItems());
            consensusResult.put("overall_confidence", overallConf);
            sessionStore.upsertPipelineStep(ctx.sessionId, "parse",
                    "consensus:" + dt.name(),
                    "SUCCESS", objectMapper.writeValueAsString(consensusResult),
                    null, null);
        } catch (Exception e) {
            log.warn("[{}] Failed to persist extraction for {}: {}", ctx.sessionId, dt, e.getMessage());
        }
    }

    /**
     * Merge raw values with per-field provenance (confidence, raw_quote) into
     * the envelope shape the UI consumes — {@code {value, confidence, rawQuote}}
     * — so {@code extractValue} / {@code extractConf} on the frontend can read
     * both. Fields without recorded meta serialize as bare values.
     */
    private static Map<String, Object> serializeFields(FieldEnvelope env) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        Map<String, FieldValue> meta = env.fieldMeta();
        for (var e : env.fields().entrySet()) {
            FieldValue m = meta.get(e.getKey());
            if (m == null || (m.confidence() == null && m.rawQuote() == null
                    && m.page() == null && m.bbox() == null)) {
                out.put(e.getKey(), e.getValue());
            } else {
                out.put(e.getKey(), m);
            }
        }
        return out;
    }
}
