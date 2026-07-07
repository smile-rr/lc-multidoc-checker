package com.lc.v2.checker.stage.segmentation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.lc.LcParseResult;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.PdfBytesCache;
import com.lc.v2.checker.infra.storage.S3FileStore;
import com.lc.v2.checker.pipeline.IngestMode;
import com.lc.v2.checker.pipeline.PipelineStageId;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import com.lc.v2.checker.stage.parse.LcParseException;
import com.lc.v2.checker.stage.parse.Mt700Parser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Segmentation — first pipeline stage after Upload.
 *
 * <p>Three jobs:</p>
 * <ol>
 *   <li>Classify uploaded docs and persist a documents row per file</li>
 *   <li>Persist bytes to S3 (MinIO) + hot-cache for in-process reads</li>
 *   <li>Run the deterministic MT700 parser so {@code ctx.lc} is populated
 *       before the segmentation gate. The Parse stage's LC view depends on this.</li>
 * </ol>
 *
 * <p>UNKNOWN docs emit a warning but do not block the pipeline (POC).
 * MT700 parse is mandatory: a missing/blank LC text fails the pipeline because
 * downstream stages (reconcile, compliance check, the :46A: required-doc gate) cannot
 * proceed without an LC reference.</p>
 */
@Component
public class SegmentationStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(SegmentationStage.class);

    private final SessionStore sessionStore;
    private final PdfBytesCache pdfCache;
    private final S3FileStore s3Store;
    private final Mt700Parser mt700Parser;
    private final ObjectMapper objectMapper;
    private final DealPageMaps dealPageMaps;
    private final DealTiffSplitter dealTiffSplitter;
    private final DocTypeRegistry docTypeRegistry;

    public SegmentationStage(SessionStore sessionStore, PdfBytesCache pdfCache, S3FileStore s3Store,
                        Mt700Parser mt700Parser, ObjectMapper objectMapper,
                        DealPageMaps dealPageMaps, DealTiffSplitter dealTiffSplitter,
                        DocTypeRegistry docTypeRegistry) {
        this.sessionStore = sessionStore;
        this.pdfCache = pdfCache;
        this.s3Store = s3Store;
        this.mt700Parser = mt700Parser;
        this.objectMapper = objectMapper;
        this.dealPageMaps = dealPageMaps;
        this.dealTiffSplitter = dealTiffSplitter;
        this.docTypeRegistry = docTypeRegistry;
    }

    private static final String STAGE = PipelineStageId.SEGMENTATION.id();

    @Override
    public String name() { return STAGE; }

    @Override
    public void execute(StageContext ctx) {
        log.info("[{}] Segmentation: mode={} docs={}",
                ctx.sessionId, ctx.ingestMode, ctx.uploadedDocBytes.size());
        ctx.eventBus.stageStarted(ctx.sessionId, STAGE);

        if (ctx.ingestMode == IngestMode.DEAL_BUNDLE) {
            executeDealBundle(ctx);
            return;
        }

        executeLegacyMultiFile(ctx);
    }

    private void executeLegacyMultiFile(StageContext ctx) {
        int unknownCount = 0;
        for (var entry : ctx.uploadedDocNames.entrySet()) {
            DocType docType = entry.getKey();
            if (docType == DocType.DEAL) continue;
            String filename = entry.getValue();
            byte[] bytes = ctx.uploadedDocBytes.get(docType);

            int pageCount = countPages(bytes);
            String docId = sessionStore.createDocument(
                    ctx.sessionId, docType, filename, pageCount, null, docTypeRegistry.descFor(docType));
            ctx.docIds.put(docType, docId);

            // Persist to S3 first, then hot-cache (S3FileStore.put handles both).
            if (bytes != null && bytes.length > 0) {
                s3Store.put(docId, bytes);
            }

            if (docType == DocType.UNKNOWN) {
                unknownCount++;
                ctx.eventBus.extractionProgress(ctx.sessionId, "UNKNOWN", STAGE,
                        filename + " → UNKNOWN (needs type confirmation)");
                log.warn("[{}] UNKNOWN doc: {}", ctx.sessionId, filename);
            } else {
                ctx.eventBus.extractionProgress(ctx.sessionId, docType.name(), STAGE,
                        filename + " → " + docType.name());
            }

            if (docType != DocType.UNKNOWN && docType != DocType.LC
                    && !ctx.confirmedDocTypes.contains(docType)) {
                ctx.confirmedDocTypes.add(docType);
            }
        }

        // MT700 parse — runs at segmentation so ctx.lc is populated before the
        // segmentation gate. The Parse stage's LC viewer + :46A: required-doc gate
        // both depend on this being done by the time the officer sees Segmentation.
        parseLcOrFail(ctx);

        finishSegmentation(ctx, ctx.uploadedDocBytes.size(), unknownCount);
    }

    private void executeDealBundle(StageContext ctx) {
        byte[] tiff = ctx.uploadedDocBytes.get(DocType.DEAL);
        if (tiff == null || tiff.length == 0) {
            throw new IllegalStateException("Deal TIFF bytes missing from upload bundle");
        }

        DealManifest manifest = dealPageMaps.resolve(ctx.dealNo)
                .orElseThrow(() -> new IllegalStateException(
                        "No deal.manifest.yml for deal_no=" + ctx.dealNo
                                + " — run build-deal-tiff.py for preset cases 01–03"));

        try {
            sessionStore.upsertPipelineStep(ctx.sessionId, STAGE, "deal_manifest",
                    "SUCCESS", objectMapper.writeValueAsString(manifest), null, null);
        } catch (Exception e) {
            log.warn("[{}] deal manifest persistence failed: {}", ctx.sessionId, e.getMessage());
        }

        ctx.uploadedDocBytes.remove(DocType.DEAL);
        ctx.uploadedDocNames.remove(DocType.DEAL);

        int segmentCount = 0;
        for (DealManifest.Segment seg : manifest.segments()) {
            DocType docType = seg.docType();
            if (!docType.isPresentedDocument()) continue;

            byte[] pdf;
            try {
                pdf = dealTiffSplitter.segmentToPdf(tiff, seg.pages());
            } catch (Exception e) {
                throw new IllegalStateException(
                        "Failed to split deal TIFF pages " + seg.pages()
                                + " for " + docType + ": " + e.getMessage(), e);
            }

            String filename = seg.source() != null && !seg.source().isBlank()
                    ? seg.source()
                    : docType.name().toLowerCase() + ".pdf";
            int pageCount = countPages(pdf);
            String desc = seg.desc() != null && !seg.desc().isBlank()
                    ? seg.desc() : docTypeRegistry.descFor(docType);
            String docId = sessionStore.createDocument(
                    ctx.sessionId, docType, filename, pageCount, List.copyOf(seg.pages()), desc);
            ctx.docIds.put(docType, docId);
            ctx.uploadedDocBytes.put(docType, pdf);
            ctx.uploadedDocNames.put(docType, filename);
            s3Store.put(docId, pdf);

            if (!ctx.confirmedDocTypes.contains(docType)) {
                ctx.confirmedDocTypes.add(docType);
            }
            segmentCount++;
            ctx.eventBus.extractionProgress(ctx.sessionId, docType.name(), STAGE,
                    "deal pages " + seg.pages() + " → " + docType.name());
        }

        parseLcOrFail(ctx);
        finishSegmentation(ctx, segmentCount, 0);
    }

    private void finishSegmentation(StageContext ctx, int docCount, int unknownCount) {
        log.info("[{}] Segmentation complete: {} total, {} UNKNOWN, confirmed={}, s3Enabled={}, lc={}",
                ctx.sessionId, docCount, unknownCount,
                ctx.confirmedDocTypes, s3Store.enabled(), ctx.lc != null);
        ctx.eventBus.stageCompleted(ctx.sessionId, STAGE,
                "docs=" + docCount + " unknown=" + unknownCount + " lc=parsed");
    }

    private void parseLcOrFail(StageContext ctx) {
        if (ctx.lcText != null && !ctx.lcText.isBlank()) {
            try {
                ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser", "parsing");
                LcParseResult result = mt700Parser.parse(ctx.lcText);
                ctx.lc = result;
                persistLc(ctx, result);
                int warnings = result.consistencyWarnings().size();
                ctx.eventBus.extractionProgress(ctx.sessionId, "LC", "mt700_parser",
                        "complete #" + result.getLcNumber() + (warnings > 0 ? " warnings=" + warnings : ""));
                log.info("[{}] LC parsed at segmentation: #{}, warnings={}",
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
     * Persist the MT700 parse result to pipeline_steps(segmentation/lc_parse).
     * Survives JVM restarts via {@code v_lc_parse}. Without this, ctx.lc is
     * in-memory only and downstream stages see null after any container
     * restart, causing every field-dependent rule to return NOT_APPLICABLE.
     *
     * Stored shape: { raw_mt700, fields, rawFields, derived, warnings }.
     */
    private void persistLc(StageContext ctx, LcParseResult lc) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("raw_mt700", lc.rawMt700());
        snapshot.put("fields", lc.envelope() != null ? lc.envelope().fields() : Map.of());
        snapshot.put("rawFields", lc.rawFields());
        snapshot.put("derived", lc.derived());
        snapshot.put("warnings", lc.consistencyWarnings());

        try {
            sessionStore.upsertPipelineStep(ctx.sessionId, STAGE, "lc_parse",
                    "SUCCESS", objectMapper.writeValueAsString(snapshot), null, null);
        } catch (Exception e) {
            log.warn("[{}] LC persistence failed (non-fatal): {}", ctx.sessionId, e.getMessage());
        }
    }
}
