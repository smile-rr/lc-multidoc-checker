package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.DocPatchRequest;
import com.lc.v2.checker.api.dto.FieldCorrectionRequest;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.fields.FieldPoolRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.S3FileStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Per-document endpoints used by the Intake + Parse stages of the UI.
 *
 *   GET    /sessions/{id}/documents/{docId}/pdf              — stream PDF bytes (cache → S3 fallback)
 *   GET    /sessions/{id}/documents/{docId}/extracts         — per-slot + consensus + off-schema
 *   PATCH  /sessions/{id}/documents/{docId}                  — officer changes type / marks reviewed
 *   POST   /sessions/{id}/documents/{docId}/fields/{key}/correction — officer corrects extracted value
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}/documents/{docId}")
public class DocumentsController {

    private static final Logger log = LoggerFactory.getLogger(DocumentsController.class);

    private final SessionStore sessionStore;
    private final S3FileStore s3Store;
    private final PipelineEventBus eventBus;
    private final ObjectMapper objectMapper;
    private final FieldPoolRegistry fieldPool;
    private final DocTypeRegistry docTypeRegistry;

    public DocumentsController(SessionStore sessionStore, S3FileStore s3Store,
                              PipelineEventBus eventBus, ObjectMapper objectMapper,
                              FieldPoolRegistry fieldPool, DocTypeRegistry docTypeRegistry) {
        this.sessionStore = sessionStore;
        this.s3Store = s3Store;
        this.eventBus = eventBus;
        this.objectMapper = objectMapper;
        this.fieldPool = fieldPool;
        this.docTypeRegistry = docTypeRegistry;
    }

    @GetMapping("/pdf")
    public ResponseEntity<byte[]> downloadPdf(@PathVariable String sessionId,
                                              @PathVariable String docId,
                                              @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        Map<String, Object> doc = sessionStore.getDocument(docId);
        if (doc == null) return ResponseEntity.notFound().build();

        // docId is content-addressed (immutable per upload) → strong ETag = quoted docId.
        String etag = "\"" + docId + "\"";
        CacheControl cacheControl = CacheControl.maxAge(Duration.ofDays(30)).cachePublic().immutable();

        if (ifNoneMatch != null && ifNoneMatch.contains(etag)) {
            return ResponseEntity.status(304)
                    .eTag(etag)
                    .cacheControl(cacheControl)
                    .build();
        }

        Optional<byte[]> bytes;
        try {
            bytes = s3Store.get(docId);
        } catch (S3FileStore.MinioAccessException e) {
            log.warn("[{}] MinIO unreachable/denied for docId={}: {} — returning 404",
                    sessionId, docId, e.getMessage());
            return ResponseEntity.status(404)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(("PDF unavailable (MinIO access failed: " + e.getMessage() + ")").getBytes());
        }
        if (bytes.isEmpty()) {
            log.warn("[{}] PDF not found: docId={} (cache={} s3Enabled={})",
                    sessionId, docId, s3Store.enabled(), s3Store.enabled());
            return ResponseEntity.status(404)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(("PDF not available (not in cache" +
                            (s3Store.enabled() ? " or MinIO)" : ")")).getBytes());
        }

        String filename = (String) doc.getOrDefault("original_filename", docId + ".pdf");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentLength(bytes.get().length);
        headers.setContentDispositionFormData("inline", filename);
        headers.setETag(etag);
        headers.setCacheControl(cacheControl);
        return new ResponseEntity<>(bytes.get(), headers, 200);
    }

    @GetMapping("/extracts")
    public ResponseEntity<Map<String, Object>> getExtracts(@PathVariable String sessionId,
                                                             @PathVariable String docId) {
        Map<String, Object> doc = sessionStore.getDocument(docId);
        if (doc == null) return ResponseEntity.notFound().build();

        // Consensus extract (read from v_doc_extracts_consensus)
        Map<String, Object> consensus = sessionStore.getDocConsensus(docId);
        Map<String, Object> consensusFields = consensus == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(parseJsonObject((String) consensus.get("fields")));
        List<Object> offSchema = consensus == null
                ? List.of()
                : parseJsonArray((String) consensus.get("off_schema_items"));
        Double overallConf = null;
        if (consensus != null && consensus.get("overall_confidence") instanceof Number n) {
            overallConf = n.doubleValue();
        }

        // Per-slot extracts (read from v_doc_extracts_slots)
        Map<String, Map<String, Object>> bySlot = new LinkedHashMap<>();
        for (Map<String, Object> row : sessionStore.getDocSlots(docId)) {
            String slot = (String) row.get("slot");
            bySlot.put(slot, parseJsonObject((String) row.get("fields")));
        }

        // Officer corrections — overlay on the consensus fields. Each correction
        // wraps the corrected value in the same envelope shape that vision
        // extraction produces, so frontend extractValue/extractConf still work.
        for (Map<String, Object> c : sessionStore.getFieldCorrections(docId)) {
            String fk = (String) c.get("field_key");
            if (fk == null) continue;
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("value", c.get("value"));
            envelope.put("confidence", "HIGH");
            envelope.put("manual", true);
            envelope.put("note", c.get("note"));
            consensusFields.put(fk, envelope);
        }

        Map<String, String> fieldLabels = new LinkedHashMap<>();
        java.util.Set<String> allKeys = new java.util.LinkedHashSet<>(consensusFields.keySet());
        for (Map<String, Object> slotFields : bySlot.values()) allKeys.addAll(slotFields.keySet());
        for (String k : allKeys) {
            fieldPool.byKey(k).ifPresent(fd -> {
                if (fd.nameEn() != null) fieldLabels.put(k, fd.nameEn());
            });
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("document", doc);
        response.put("fields", consensusFields);
        response.put("fieldLabels", fieldLabels);
        response.put("offSchemaItems", offSchema);
        response.put("slotResults", bySlot);
        response.put("overallConfidence", overallConf);
        return ResponseEntity.ok(response);
    }

    @PatchMapping
    public ResponseEntity<Map<String, Object>> patchDocument(@PathVariable String sessionId,
                                                              @PathVariable String docId,
                                                              @RequestBody DocPatchRequest req) {
        Map<String, Object> doc = sessionStore.getDocument(docId);
        if (doc == null) return ResponseEntity.notFound().build();

        String typeDesc = null;
        if (req.docType() != null) {
            try {
                typeDesc = docTypeRegistry.descFor(DocType.valueOf(req.docType()));
            } catch (IllegalArgumentException ignored) {
                typeDesc = req.docType();
            }
        }
        sessionStore.patchDocument(docId, req.docType(), req.parseStatus(), req.confirmedByOfficer(), typeDesc);
        log.info("[{}] doc {} patched: type={} status={} confirmed={}",
                sessionId, docId, req.docType(), req.parseStatus(), req.confirmedByOfficer());

        if (req.docType() != null) {
            eventBus.docTypeChanged(sessionId, docId, req.docType(), req.officerId());
            // New: officer_actions audit row
            String prevType = doc.get("doc_type") == null ? null : doc.get("doc_type").toString();
            String payload = String.format("{\"from\":%s,\"to\":\"%s\"}",
                    prevType == null ? "null" : "\"" + prevType + "\"", req.docType());
            sessionStore.appendOfficerAction(sessionId, "doc_type_changed", docId,
                    payload, req.officerId(), null);
        }
        if ("REVIEWED".equalsIgnoreCase(req.parseStatus())) {
            eventBus.docReviewed(sessionId, docId, req.officerId());
            sessionStore.appendOfficerAction(sessionId, "doc_reviewed", docId,
                    "{}", req.officerId(), null);
        }

        return ResponseEntity.ok(sessionStore.getDocument(docId));
    }

    @PostMapping("/fields/{fieldKey}/correction")
    public ResponseEntity<Map<String, Object>> correctField(@PathVariable String sessionId,
                                                              @PathVariable String docId,
                                                              @PathVariable String fieldKey,
                                                              @RequestBody FieldCorrectionRequest req) {
        Map<String, Object> doc = sessionStore.getDocument(docId);
        if (doc == null) return ResponseEntity.notFound().build();

        eventBus.fieldCorrected(sessionId, docId, fieldKey, req.value(), req.issueKind(), req.officerId());
        // Officer correction → append-only officer_actions row.
        // The consensus extract in pipeline_steps stays immutable; the view
        // layer overlays the latest correction in DocumentsController.getExtracts.
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("value", req.value());
            payload.put("issue_kind", req.issueKind());
            sessionStore.appendOfficerAction(sessionId, "field_corrected",
                    docId + ":" + fieldKey,
                    objectMapper.writeValueAsString(payload),
                    req.officerId(), req.note());
        } catch (Exception e) {
            log.warn("[{}] officer_actions append failed for field_corrected: {}", sessionId, e.getMessage());
        }
        log.info("[{}] field correction doc={} key={} value={} kind={}",
                sessionId, docId, fieldKey, req.value(), req.issueKind());

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "fieldKey", fieldKey,
                "value", req.value(),
                "issueKind", req.issueKind()));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonObject(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(json, Map.class);
            return parsed == null ? Map.of() : parsed;
        } catch (Exception e) {
            log.warn("parseJsonObject failed: {}", e.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Object> parseJsonArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Object> parsed = objectMapper.readValue(json, List.class);
            return parsed == null ? List.of() : parsed;
        } catch (Exception e) {
            log.warn("parseJsonArray failed: {}", e.getMessage());
            return new ArrayList<>();
        }
    }
}
