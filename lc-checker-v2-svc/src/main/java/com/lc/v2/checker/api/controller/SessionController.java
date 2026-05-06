package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * REST API for LC v2 sessions.
 *
 * POST /api/v2/sessions          — upload files + MT700 text, create session, return ID
 * GET  /api/v2/sessions          — list recent sessions (default: 50)
 * GET  /api/v2/sessions/{id}     — get single session with documents
 * GET  /api/v2/sessions/{id}/trace — pipeline events for debug
 */
@RestController
@RequestMapping("/api/v2/sessions")
public class SessionController {

    private static final Logger log = LoggerFactory.getLogger(SessionController.class);

    private final PipelineService pipelineService;
    private final SessionStore sessionStore;
    private final DocTypeRegistry docTypeRegistry;

    public SessionController(PipelineService pipelineService, SessionStore sessionStore,
                              DocTypeRegistry docTypeRegistry) {
        this.pipelineService = pipelineService;
        this.sessionStore = sessionStore;
        this.docTypeRegistry = docTypeRegistry;
    }

    /**
     * Create a new session. Accepts:
     *   - lcText: MT700 text in form field (required)
     *   - files[]: PDF files (multipart, one per doc type)
     * Returns: { sessionId: "...", message: "pipeline started" }
     */
    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<Map<String, Object>> createSession(
            @RequestPart(value = "lcText", required = false) String lcText,
            @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        try {
            Map<DocType, Map.Entry<String, byte[]>> documents = new LinkedHashMap<>();

            if (files != null) {
                for (MultipartFile file : files) {
                    if (file.isEmpty()) continue;
                    String filename = file.getOriginalFilename();
                    byte[] bytes = file.getBytes();
                    DocType docType = classify(filename, bytes);
                    log.info("Received file: {} → {}", filename, docType);
                    String safeName = filename != null ? filename : "unknown.bin";
                    if (docType != DocType.UNKNOWN && documents.containsKey(docType)) {
                        String existing = documents.get(docType).getKey();
                        return ResponseEntity.badRequest().body(Map.of(
                                "error", "duplicate_doc_type",
                                "docType", docType.name(),
                                "files", List.of(existing, safeName),
                                "message", "Two files classified as " + docType.name()
                                        + ": '" + existing + "' and '" + safeName
                                        + "'. Please pick one."));
                    }
                    documents.put(docType, Map.entry(safeName, bytes));
                }
            }

            String sessionId = pipelineService.createSession(lcText, documents);
            log.info("Created session: {} with {} docs", sessionId, documents.size());

            return ResponseEntity.ok(Map.of(
                    "sessionId", sessionId,
                    "message", "pipeline started",
                    "docCount", documents.size()));
        } catch (Exception e) {
            log.error("Session creation failed: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Filename + content sniff classification.
     *
     *   *.txt with filename containing "mt700"  → DocType.LC
     *   *.txt with content starting :27: or :20: → DocType.LC
     *   otherwise → docTypeRegistry.classifyFilename (existing PDF path)
     */
    private DocType classify(String filename, byte[] bytes) {
        if (filename == null) return docTypeRegistry.classifyFilename(null);
        String lower = filename.toLowerCase();
        if (lower.endsWith(".txt") || lower.endsWith(".fin") || lower.endsWith(".swift")) {
            if (lower.contains("mt700")) return DocType.LC;
            if (bytes != null && bytes.length > 0) {
                String head = new String(bytes, 0, Math.min(256, bytes.length),
                        java.nio.charset.StandardCharsets.UTF_8).trim();
                if (head.startsWith(":27:") || head.startsWith(":20:") || head.startsWith(":40A:")) {
                    return DocType.LC;
                }
            }
        }
        return docTypeRegistry.classifyFilename(filename);
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listSessions(
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(sessionStore.listSessions(Math.min(limit, 200)));
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<Map<String, Object>> getSession(@PathVariable String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(session);
    }

    @GetMapping("/{sessionId}/trace")
    public ResponseEntity<Map<String, Object>> getTrace(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of(
                "sessionId", sessionId,
                "events", sessionStore.getEvents(sessionId)));
    }
}
