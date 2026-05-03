package com.lc.v2.checker.stage.intake;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.PdfBytesCache;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.io.ByteArrayInputStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 0 — Intake.
 * Classifies uploaded docs, persists a documents row per file, confirms doc types for Parse.
 * UNKNOWN docs emit a warning but do not block the pipeline (POC).
 */
@PipelineStage(name = "intake")
@Component
public class IntakeStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(IntakeStage.class);

    private final SessionStore sessionStore;
    private final PdfBytesCache pdfCache;

    public IntakeStage(SessionStore sessionStore, PdfBytesCache pdfCache) {
        this.sessionStore = sessionStore;
        this.pdfCache = pdfCache;
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
            if (bytes != null && bytes.length > 0) {
                pdfCache.put(docId, bytes);
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

        log.info("[{}] IntakeStage complete: {} total, {} UNKNOWN, confirmed={}",
                ctx.sessionId, ctx.uploadedDocBytes.size(), unknownCount, ctx.confirmedDocTypes);
        ctx.eventBus.stageCompleted(ctx.sessionId, "intake",
                "docs=" + ctx.uploadedDocBytes.size() + " unknown=" + unknownCount);
    }

    private int countPages(byte[] pdfBytes) {
        if (pdfBytes == null || pdfBytes.length == 0) return 0;
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            return doc.getNumberOfPages();
        } catch (Exception e) {
            return 1;
        }
    }
}
