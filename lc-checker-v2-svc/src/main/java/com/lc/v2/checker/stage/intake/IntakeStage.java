package com.lc.v2.checker.stage.intake;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.lc.LcParseResult;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.PdfBytesCache;
import com.lc.v2.checker.infra.storage.S3FileStore;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import com.lc.v2.checker.stage.parse.LcParseException;
import com.lc.v2.checker.stage.parse.Mt700Parser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 0 — Intake.
 *
 * <p>Three jobs:</p>
 * <ol>
 *   <li>Classify uploaded docs and persist a documents row per file</li>
 *   <li>Persist bytes to S3 (MinIO) + hot-cache for in-process reads</li>
 *   <li>Run the deterministic MT700 parser so {@code ctx.lc} is populated
 *       before the intake gate. The Parse stage's LC view depends on this.</li>
 * </ol>
 *
 * <p>UNKNOWN docs emit a warning but do not block the pipeline (POC).
 * MT700 parse is mandatory: a missing/blank LC text fails the pipeline because
 * downstream stages (reconcile, examine, the :46A: required-doc gate) cannot
 * proceed without an LC reference.</p>
 */
@PipelineStage(name = "intake")
@Component
public class IntakeStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(IntakeStage.class);

    private final SessionStore sessionStore;
    private final PdfBytesCache pdfCache;
    private final S3FileStore s3Store;
    private final Mt700Parser mt700Parser;
    private final ObjectMapper objectMapper;

    public IntakeStage(SessionStore sessionStore, PdfBytesCache pdfCache, S3FileStore s3Store,
                        Mt700Parser mt700Parser, ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.pdfCache = pdfCache;
        this.s3Store = s3Store;
        this.mt700Parser = mt700Parser;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() { return "intake"; }

    @Override
    public void execute(StageContext ctx) {
        log.info("[{}] IntakeStage: {} docs", ctx.sessionId, ctx.uploadedDocBytes.size());
        ctx.eventBus.stageStarted(ctx.sessionId, "intake");

        int unknownCount = 0;
        for (var entry : ctx.uploadedDocNames.entrySet()) {
            DocType docType = entry.getKey();
            String filename = entry.getValue();
            byte[] bytes = ctx.uploadedDocBytes.get(docType);

            int pageCount = countPages(bytes);
            String docId = sessionStore.createDocument(ctx.sessionId, docType, filename, pageCount);
            ctx.docIds.put(docType, docId);

            // Persist to S3 first, then hot-cache (S3FileStore.put handles both).
            if (bytes != null && bytes.length > 0) {
                s3Store.put(docId, bytes);
            }

            if (docType == DocType.UNKNOWN) {
                unknownCount++;
                ctx.eventBus.extractionProgress(ctx.sessionId, "UNKNOWN", "intake",
                        filename + " → UNKNOWN (needs type confirmation)");
                log.warn("[{}] UNKNOWN doc: {}", ctx.sessionId, filename);
            } else {
                ctx.eventBus.extractionProgress(ctx.sessionId, docType.name(), "intake",
                        filename + " → " + docType.name());
            }

            if (docType != DocType.UNKNOWN && docType != DocType.LC
                    && !ctx.confirmedDocTypes.contains(docType)) {
                ctx.confirmedDocTypes.add(docType);
            }
        }

        // MT700 parse — runs at intake so ctx.lc is populated before the
        // intake gate. The Parse stage's LC viewer + :46A: required-doc gate
        // both depend on this being done by the time the officer sees Intake.
        if (ctx.lcText != null && !ctx.lcText.isBlank()) {
            try {
                ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser", "parsing");
                LcParseResult result = mt700Parser.parse(ctx.lcText);
                ctx.lc = result;
                persistLc(ctx, result);
                int warnings = result.consistencyWarnings().size();
                ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser",
                        "complete #" + result.getLcNumber() + (warnings > 0 ? " warnings=" + warnings : ""));
                log.info("[{}] LC parsed at intake: #{}, warnings={}",
                        ctx.sessionId, result.getLcNumber(), warnings);
            } catch (LcParseException e) {
                log.error("[{}] MT700 parse failed: {}", ctx.sessionId, e.getMessage());
                ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser", "error: " + e.getMessage());
                throw e;
            }
        } else {
            log.warn("[{}] No LC text in context — pipeline cannot proceed", ctx.sessionId);
            throw new IllegalStateException("LC (MT700) text is missing — required for the pipeline");
        }

        log.info("[{}] IntakeStage complete: {} total, {} UNKNOWN, confirmed={}, s3Enabled={}, lc={}",
                ctx.sessionId, ctx.uploadedDocBytes.size(), unknownCount,
                ctx.confirmedDocTypes, s3Store.enabled(), ctx.lc != null);
        ctx.eventBus.stageCompleted(ctx.sessionId, "intake",
                "docs=" + ctx.uploadedDocBytes.size() + " unknown=" + unknownCount + " lc=parsed");
    }

    private int countPages(byte[] pdfBytes) {
        if (pdfBytes == null || pdfBytes.length == 0) return 0;
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            return 1;
        }
    }

    /**
     * Persist the MT700 parse result to final_report.lc so it survives JVM
     * restarts. Without this, ctx.lc is in-memory only and downstream stages
     * (Reconcile / Examine) see null after any container restart, causing
     * every field-dependent rule to return NOT_APPLICABLE.
     *
     * Stored shape: { raw, fields, rawFields, derived, warnings }.
     */
    private void persistLc(StageContext ctx, LcParseResult lc) {
        try {
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("raw", lc.rawMt700());
            snapshot.put("fields", lc.envelope() != null ? lc.envelope().fields() : Map.of());
            snapshot.put("rawFields", lc.rawFields());
            snapshot.put("derived", lc.derived());
            snapshot.put("warnings", lc.consistencyWarnings());
            sessionStore.mergeFinalReportSection(ctx.sessionId, "lc",
                    objectMapper.writeValueAsString(snapshot));
        } catch (Exception e) {
            log.warn("[{}] LC persistence failed (non-fatal): {}", ctx.sessionId, e.getMessage());
        }
    }
}
