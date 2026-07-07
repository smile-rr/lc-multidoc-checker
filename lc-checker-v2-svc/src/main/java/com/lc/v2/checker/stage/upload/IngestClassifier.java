package com.lc.v2.checker.stage.upload;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;

/**
 * Filename + content sniff for multipart ingest.
 *
 * <p>Used by {@link com.lc.v2.checker.api.controller.SessionController} when
 * building the initial {@link com.lc.v2.checker.pipeline.StageContext}.</p>
 */
@Component
public class IngestClassifier {

    private final DocTypeRegistry docTypeRegistry;

    public IngestClassifier(DocTypeRegistry docTypeRegistry) {
        this.docTypeRegistry = docTypeRegistry;
    }

    /**
     * @param filename original upload name (may be null)
     * @param bytes    file payload for content sniff
     */
    public DocType classify(String filename, byte[] bytes) {
        if (filename == null) return docTypeRegistry.classifyFilename(null);
        String lower = filename.toLowerCase();
        if (lower.endsWith(".txt") || lower.endsWith(".fin") || lower.endsWith(".swift")) {
            if (lower.contains("mt700")) return DocType.LC;
            if (bytes != null && bytes.length > 0) {
                String head = new String(bytes, 0, Math.min(256, bytes.length), StandardCharsets.UTF_8).trim();
                if (head.startsWith(":27:") || head.startsWith(":20:") || head.startsWith(":40A:")) {
                    return DocType.LC;
                }
            }
        }
        return docTypeRegistry.classifyFilename(filename);
    }
}
