package com.lc.v2.checker.stage.parse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.lc.LcParseResult;
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
 * 1a. Mt700Parser → LcParseResult (LC self-consistency check included)
 * 1b. VisionExtractService → sequential per-doc extraction in upload order.
 *     Within each doc, enabled vision slots fire in parallel; consensus = majority vote.
 *     Sequential across docs gives a clean, ordered ActivityStrip and lets the user follow
 *     "currently extracting BOL…" → "currently extracting INV…" in the same order they
 *     see in the doc rail. Honours ctx.cancelled between docs (cooperative cancel).
 */
@PipelineStage(name = "parse")
@Component
public class ParseStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ParseStage.class);

    private final Mt700Parser mt700Parser;
    private final VisionExtractService visionExtractService;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;

    public ParseStage(Mt700Parser mt700Parser, VisionExtractService visionExtractService,
                      SessionStore sessionStore, ObjectMapper objectMapper) {
        this.mt700Parser = mt700Parser;
        this.visionExtractService = visionExtractService;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() { return "parse"; }

    @Override
    public void execute(StageContext ctx) {
        log.info("[{}] ParseStage starting", ctx.sessionId);
        ctx.eventBus.stageStarted(ctx.sessionId, "parse");

        // 1a — LC parse
        if (ctx.lcText != null && !ctx.lcText.isBlank()) {
            parseLc(ctx);
        } else {
            log.warn("[{}] No LC text in context — skipping MT700 parse", ctx.sessionId);
        }

        // 1b — Vision extraction in parallel for all uploaded doc types
        List<DocType> toExtract = new ArrayList<>();
        for (DocType dt : ctx.uploadedDocBytes.keySet()) {
            if (dt != DocType.LC && dt != DocType.UNKNOWN) toExtract.add(dt);
        }

        if (!toExtract.isEmpty()) {
            extractAllDocTypes(ctx, toExtract);
        }

        ctx.eventBus.stageCompleted(ctx.sessionId, "parse",
                "lc=" + (ctx.lc != null) + " extracts=" + ctx.extracts.size());
        log.info("[{}] ParseStage complete: {} doc extracts", ctx.sessionId, ctx.extracts.size());
    }

    private void parseLc(StageContext ctx) {
        try {
            ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser", "parsing");
            LcParseResult result = mt700Parser.parse(ctx.lcText);
            ctx.lc = result;
            int warnings = result.consistencyWarnings().size();
            ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser",
                    "complete #" + result.getLcNumber() + (warnings > 0 ? " warnings=" + warnings : ""));
            log.info("[{}] LC parsed: #{}, warnings={}", ctx.sessionId, result.getLcNumber(), warnings);
        } catch (LcParseException e) {
            log.error("[{}] MT700 parse failed: {}", ctx.sessionId, e.getMessage());
            ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser", "error: " + e.getMessage());
            throw e;
        }
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

    /** Persist per-slot envelopes + the consensus row into lc_v2.extraction_results. */
    private void persistExtract(StageContext ctx, DocType dt, DocumentExtract extract) {
        String docId = ctx.docIds.get(dt);
        if (docId == null) {
            log.warn("[{}] No docId for {} — extraction not persisted", ctx.sessionId, dt);
            return;
        }
        try {
            // Per-slot rows
            for (var entry : extract.bySlot().entrySet()) {
                String slot = entry.getKey();
                FieldEnvelope env = entry.getValue();
                String fieldsJson = objectMapper.writeValueAsString(env.fields());
                sessionStore.insertExtractionResult(docId, ctx.sessionId, slot,
                        fieldsJson, "[]", null, false);
            }
            // Consensus row (carries off-schema items)
            String consensusJson = objectMapper.writeValueAsString(extract.consensus().fields());
            String offSchemaJson = objectMapper.writeValueAsString(extract.offSchemaItems());
            double overallConf = switch (extract.overallConfidence()) {
                case HIGH -> 0.95;
                case MED -> 0.80;
                case LOW -> 0.55;
            };
            sessionStore.insertExtractionResult(docId, ctx.sessionId, "consensus",
                    consensusJson, offSchemaJson, overallConf, true);
        } catch (Exception e) {
            log.warn("[{}] Failed to persist extraction for {}: {}", ctx.sessionId, dt, e.getMessage());
        }
    }
}
