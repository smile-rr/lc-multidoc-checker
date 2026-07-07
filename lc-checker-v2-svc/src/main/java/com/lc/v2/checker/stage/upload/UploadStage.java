package com.lc.v2.checker.stage.upload;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.IngestMode;
import com.lc.v2.checker.pipeline.PipelineStageId;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Upload — first pipeline stage. Validates the ingest bundle and persists an
 * upload manifest to {@code pipeline_steps(upload/manifest)}.
 *
 * <p>Raw bytes land in {@link StageContext} from
 * {@link com.lc.v2.checker.pipeline.PipelineService#createSession}; this stage
 * does not read HTTP. Segmentation owns document rows, S3 persistence, and MT700
 * parse.</p>
 */
@Component
public class UploadStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(UploadStage.class);
    private static final String STAGE = PipelineStageId.UPLOAD.id();

    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;

    public UploadStage(SessionStore sessionStore, ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() { return STAGE; }

    @Override
    public void execute(StageContext ctx) {
        ctx.eventBus.stageStarted(ctx.sessionId, STAGE);

        boolean hasLcText = ctx.lcText != null && !ctx.lcText.isBlank();
        boolean hasLcFile = ctx.uploadedDocBytes.containsKey(DocType.LC);
        boolean dealBundle = ctx.ingestMode == IngestMode.DEAL_BUNDLE;
        if (!hasLcText && !hasLcFile) {
            throw new IllegalStateException(
                    "MT700 LC text is required — provide lcText or an MT700 file");
        }
        if (dealBundle && !ctx.uploadedDocBytes.containsKey(DocType.DEAL)) {
            throw new IllegalStateException("Deal bundle requires deal-NN.pdf");
        }
        if (!dealBundle && ctx.uploadedDocBytes.isEmpty() && !hasLcText) {
            throw new IllegalStateException("No documents in upload bundle");
        }

        List<Map<String, Object>> files = new ArrayList<>();
        for (var entry : ctx.uploadedDocNames.entrySet()) {
            DocType docType = entry.getKey();
            if (docType == DocType.DEAL) continue;
            String filename = entry.getValue();
            byte[] bytes = ctx.uploadedDocBytes.get(docType);
            int size = bytes != null ? bytes.length : 0;
            String sha = sha256(bytes);

            ctx.eventBus.extractionProgress(ctx.sessionId, docType.name(), STAGE,
                    filename + " → " + docType.name() + " (" + size + " bytes)");

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("docType", docType.name());
            row.put("filename", filename);
            row.put("sizeBytes", size);
            row.put("sha256", sha);
            files.add(row);
        }

        if (hasLcText && !hasLcFile) {
            ctx.eventBus.extractionProgress(ctx.sessionId, "LC", STAGE,
                    "lcText field (" + ctx.lcText.length() + " chars)");
        }

        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("mode", ctx.ingestMode.name());
        manifest.put("files", files);
        manifest.put("lcTextChars", hasLcText ? ctx.lcText.length() : 0);
        manifest.put("docCount", files.size() + (hasLcText && !hasLcFile ? 1 : 0));
        if (dealBundle) {
            manifest.put("dealNo", ctx.dealNo);
            byte[] dealPdf = ctx.uploadedDocBytes.get(DocType.DEAL);
            try {
                try (PDDocument doc = Loader.loadPDF(dealPdf)) {
                    manifest.put("pageCount", doc.getNumberOfPages());
                }
            } catch (Exception e) {
                log.warn("[{}] deal PDF page count failed: {}", ctx.sessionId, e.getMessage());
            }
        }

        try {
            sessionStore.upsertPipelineStep(ctx.sessionId, STAGE, "manifest",
                    "SUCCESS", objectMapper.writeValueAsString(manifest), null, null);
        } catch (Exception e) {
            log.warn("[{}] upload manifest persistence failed: {}", ctx.sessionId, e.getMessage());
        }

        log.info("[{}] Upload complete: {} file(s), lcText={}",
                ctx.sessionId, files.size(), hasLcText);
        ctx.eventBus.stageCompleted(ctx.sessionId, STAGE,
                "files=" + files.size() + " lc=" + (hasLcText || hasLcFile));
    }

    private static String sha256(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            return "";
        }
    }
}
