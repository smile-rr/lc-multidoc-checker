package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.DealPdfStore;
import com.lc.v2.checker.stage.segmentation.DealPdfSplitter;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Merged deal bundle PDF for Segmentation preview.
 *
 *   GET /sessions/{id}/deal       — { available, pageCount, filename }
 *   GET /sessions/{id}/deal/pdf   — merged deal-NN.pdf bytes
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}/deal")
public class DealController {

    private static final Logger log = LoggerFactory.getLogger(DealController.class);
    private static final String STAGE_SEGMENTATION = "segmentation";

    private final SessionStore sessionStore;
    private final DealPdfStore dealPdfStore;
    private final DealPdfSplitter dealPdfSplitter;
    private final ObjectMapper objectMapper;

    public DealController(SessionStore sessionStore, DealPdfStore dealPdfStore,
                          DealPdfSplitter dealPdfSplitter, ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.dealPdfStore = dealPdfStore;
        this.dealPdfSplitter = dealPdfSplitter;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> info(@PathVariable String sessionId) {
        if (sessionStore.getSession(sessionId) == null) {
            return ResponseEntity.notFound().build();
        }

        boolean available = dealPdfStore.isAvailable(sessionId);
        Integer pageCount = readStoredPageCount(sessionId);
        String filename = readStoredFilename(sessionId);

        if (pageCount == null && available) {
            pageCount = dealPdfStore.get(sessionId)
                    .map(bytes -> {
                        try {
                            return dealPdfSplitter.pageCount(bytes);
                        } catch (Exception e) {
                            log.warn("[{}] deal PDF page count failed: {}", sessionId, e.getMessage());
                            return null;
                        }
                    })
                    .orElse(null);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("available", available);
        body.put("pageCount", pageCount != null ? pageCount : 0);
        body.put("filename", filename);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String sessionId,
                                    @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false)
                                    String ifNoneMatch) {
        if (sessionStore.getSession(sessionId) == null) {
            return ResponseEntity.notFound().build();
        }

        Optional<byte[]> pdf = dealPdfStore.get(sessionId);
        if (pdf.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        String etag = "\"" + sessionId + "-deal-pdf\"";
        CacheControl cacheControl = CacheControl.maxAge(Duration.ofHours(1)).cachePublic();
        if (ifNoneMatch != null && ifNoneMatch.contains(etag)) {
            return ResponseEntity.status(304).eTag(etag).cacheControl(cacheControl).build();
        }

        String filename = readStoredFilename(sessionId);
        if (filename == null || filename.isBlank()) filename = "deal.pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentLength(pdf.get().length);
        headers.setContentDispositionFormData("inline", filename);
        headers.setETag(etag);
        headers.setCacheControl(cacheControl);
        return new ResponseEntity<>(pdf.get(), headers, 200);
    }

    private Integer readStoredPageCount(String sessionId) {
        Integer fromSeg = parseMetaInt(
                sessionStore.getPipelineStepResult(sessionId, STAGE_SEGMENTATION, "deal_pdf"), "pageCount");
        if (fromSeg != null) return fromSeg;
        return parseMetaInt(
                sessionStore.getPipelineStepResult(sessionId, "upload", "manifest"), "pageCount");
    }

    private String readStoredFilename(String sessionId) {
        String json = sessionStore.getPipelineStepResult(sessionId, STAGE_SEGMENTATION, "deal_pdf");
        if (json == null || json.isBlank()) return null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(json, Map.class);
            Object fn = m.get("filename");
            return fn == null ? null : fn.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private Integer parseMetaInt(String json, String key) {
        if (json == null || json.isBlank()) return null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(json, Map.class);
            Object v = m.get(key);
            if (v instanceof Number n) return n.intValue();
        } catch (Exception ignored) {
            // fall through
        }
        return null;
    }
}
