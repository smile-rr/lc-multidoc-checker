package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.LockRequest;
import com.lc.v2.checker.api.dto.ReconcileResponse;
import com.lc.v2.checker.api.dto.TriageRequest;
import com.lc.v2.checker.api.dto.UnlockRequest;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reconcile-stage endpoints used by the pivot table + lock gate UI.
 *
 *   GET   /sessions/{id}/reconcile          — pivot rows + lock state + triage map
 *   POST  /sessions/{id}/reconcile/triage   — officer marks discrepancy genuine/parse-error
 *   POST  /sessions/{id}/lock               — freeze parsed dataset
 *   POST  /sessions/{id}/unlock             — unfreeze with reason
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}")
public class ReconcileController {

    private static final Logger log = LoggerFactory.getLogger(ReconcileController.class);

    private final SessionStore sessionStore;
    private final PipelineEventBus eventBus;
    private final ObjectMapper objectMapper;

    public ReconcileController(SessionStore sessionStore, PipelineEventBus eventBus,
                                ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.eventBus = eventBus;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/reconcile")
    public ResponseEntity<ReconcileResponse> getReconcile(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();

        // Lock + triage state
        Map<String, Object> recState = sessionStore.getReconcileState(sessionId);
        boolean locked = recState != null && Boolean.TRUE.equals(recState.get("locked"));
        Instant lockedAt = recState == null ? null : toInstant(recState.get("locked_at"));
        String lockedBy = recState == null ? null : (String) recState.get("locked_by_officer");
        Map<String, String> triage = parseTriage(recState);

        // Pivot rows — derived from final_report.reconcile if present, else empty
        List<ReconcileResponse.ReconRow> rows = readReconRowsFromFinalReport(sessionId);

        return ResponseEntity.ok(new ReconcileResponse(rows, locked, lockedAt, lockedBy, triage));
    }

    @PostMapping("/reconcile/triage")
    public ResponseEntity<Map<String, Object>> triage(@PathVariable String sessionId,
                                                        @RequestBody TriageRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        sessionStore.upsertReconcileTriage(sessionId, req.fieldKey(), req.decision());
        eventBus.reconcileTriaged(sessionId, req.fieldKey(), req.decision(), req.officerId());
        log.info("[{}] reconcile triage: {} → {}", sessionId, req.fieldKey(), req.decision());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/lock")
    public ResponseEntity<Map<String, Object>> lock(@PathVariable String sessionId,
                                                      @RequestBody LockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        sessionStore.lockSession(sessionId, req.officerId());
        eventBus.locked(sessionId, req.officerId());
        log.info("[{}] dataset locked by {}", sessionId, req.officerId());
        return ResponseEntity.ok(Map.of("ok", true, "lockedAt", Instant.now().toString()));
    }

    @PostMapping("/unlock")
    public ResponseEntity<Map<String, Object>> unlock(@PathVariable String sessionId,
                                                       @RequestBody UnlockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        sessionStore.unlockSession(sessionId, req.officerId());
        eventBus.unlocked(sessionId, req.officerId(), req.reason());
        log.info("[{}] dataset unlocked by {}: {}", sessionId, req.officerId(), req.reason());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @SuppressWarnings("unchecked")
    private List<ReconcileResponse.ReconRow> readReconRowsFromFinalReport(String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return List.of();
        Object finalReport = session.get("final_report");
        if (!(finalReport instanceof String fr) || fr.isBlank()) return List.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(fr, Map.class);
            Object rec = parsed.get("reconcile");
            if (!(rec instanceof List<?> list)) return List.of();
            List<ReconcileResponse.ReconRow> out = new ArrayList<>(list.size());
            for (Object obj : list) {
                if (!(obj instanceof Map<?, ?> map)) continue;
                Map<String, Object> m = (Map<String, Object>) map;
                String fk = str(m.get("fieldKey"));
                if (fk == null) continue;
                out.add(new ReconcileResponse.ReconRow(
                        fk,
                        str(m.getOrDefault("label", fk)),
                        str(m.get("article")),
                        str(m.getOrDefault("group", "Other")),
                        (Map<String, Object>) m.getOrDefault("valueByDocType", Map.of()),
                        str(m.getOrDefault("verdict", "NA")),
                        str(m.get("discrepancyDetail"))
                ));
            }
            return out;
        } catch (Exception e) {
            log.warn("[{}] reconcile parse from final_report failed: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> parseTriage(Map<String, Object> recState) {
        if (recState == null) return Map.of();
        Object raw = recState.get("triage");
        if (!(raw instanceof String s) || s.isBlank()) return Map.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(s, Map.class);
            Map<String, String> out = new LinkedHashMap<>();
            for (var entry : parsed.entrySet()) {
                if (entry.getValue() != null) out.put(entry.getKey(), entry.getValue().toString());
            }
            return out;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static Instant toInstant(Object o) {
        if (o == null) return null;
        if (o instanceof Instant i) return i;
        if (o instanceof Timestamp t) return t.toInstant();
        if (o instanceof java.util.Date d) return d.toInstant();
        return null;
    }

    private static <T> ResponseEntity<T> frozen() {
        return ResponseEntity.status(409).build();
    }
}
