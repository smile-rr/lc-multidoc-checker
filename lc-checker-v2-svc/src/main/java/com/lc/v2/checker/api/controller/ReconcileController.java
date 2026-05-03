package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.CellDecisionRequest;
import com.lc.v2.checker.api.dto.LockRequest;
import com.lc.v2.checker.api.dto.ReconcileResponse;
import com.lc.v2.checker.api.dto.TriageRequest;
import com.lc.v2.checker.api.dto.UnlockRequest;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.reconcile.ReconField;
import com.lc.v2.checker.infra.fields.FieldDefinition;
import com.lc.v2.checker.infra.fields.FieldPoolRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import com.lc.v2.checker.pipeline.PipelineService;
import com.lc.v2.checker.pipeline.StageContext;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Reconcile-stage endpoints.
 *
 *   GET    /sessions/{id}/reconcile                 — matrix + lock + cell decisions
 *   POST   /sessions/{id}/reconcile/cell-decision   — per-cell officer action
 *   DELETE /sessions/{id}/reconcile/cell-decision   — clear a cell decision
 *   POST   /sessions/{id}/reconcile/triage          — legacy row-level (kept for compat)
 *   POST   /sessions/{id}/lock                      — freeze
 *   POST   /sessions/{id}/unlock                    — unfreeze with reason
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}")
public class ReconcileController {

    private static final Logger log = LoggerFactory.getLogger(ReconcileController.class);

    private final SessionStore sessionStore;
    private final PipelineEventBus eventBus;
    private final ObjectMapper objectMapper;
    private final PipelineService pipelineService;
    private final FieldPoolRegistry fieldPool;

    public ReconcileController(SessionStore sessionStore, PipelineEventBus eventBus,
                                ObjectMapper objectMapper, PipelineService pipelineService,
                                FieldPoolRegistry fieldPool) {
        this.sessionStore = sessionStore;
        this.eventBus = eventBus;
        this.objectMapper = objectMapper;
        this.pipelineService = pipelineService;
        this.fieldPool = fieldPool;
    }

    @GetMapping("/reconcile")
    public ResponseEntity<ReconcileResponse> getReconcile(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();

        Map<String, Object> recState = sessionStore.getReconcileState(sessionId);
        boolean locked = recState != null && Boolean.TRUE.equals(recState.get("locked"));
        Instant lockedAt = recState == null ? null : toInstant(recState.get("locked_at"));
        String lockedBy = recState == null ? null : (String) recState.get("locked_by_officer");
        Map<String, String> triage = parseTriage(recState);

        // Prefer in-memory ctx (live during pipeline run); fall back to final_report.
        StageContext ctx = pipelineService.getContext(sessionId);
        List<ReconcileResponse.ReconRow> rows = (ctx != null && ctx.reconFields != null)
                ? buildRowsFromCtx(ctx.reconFields)
                : readReconRowsFromFinalReport(sessionId);

        // Layer in cell decisions
        List<ReconcileResponse.CellDecision> decisions = readCellDecisions(sessionId);

        return ResponseEntity.ok(new ReconcileResponse(
                rows, locked, lockedAt, lockedBy, triage, decisions));
    }

    @PostMapping("/reconcile/cell-decision")
    public ResponseEntity<Map<String, Object>> cellDecision(@PathVariable String sessionId,
                                                              @RequestBody CellDecisionRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        if (req.fieldKey() == null || req.docType() == null || req.decision() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "fieldKey/docType/decision required"));
        }
        if ("accept_match".equals(req.decision()) && (req.note() == null || req.note().isBlank())) {
            return ResponseEntity.badRequest().body(Map.of("error", "note required for accept_match"));
        }
        sessionStore.upsertCellDecision(sessionId, req.fieldKey(), req.docType(),
                req.decision(), req.note(), req.officerId());
        eventBus.reconcileCellDecided(sessionId, req.fieldKey(), req.docType(),
                req.decision(), req.note(), req.officerId());
        log.info("[{}] reconcile cell decided: {} × {} → {}",
                sessionId, req.fieldKey(), req.docType(), req.decision());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @DeleteMapping("/reconcile/cell-decision")
    public ResponseEntity<Map<String, Object>> clearCellDecision(@PathVariable String sessionId,
                                                                   @RequestBody CellDecisionRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        sessionStore.deleteCellDecision(sessionId, req.fieldKey(), req.docType());
        eventBus.reconcileCellCleared(sessionId, req.fieldKey(), req.docType(), req.officerId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/reconcile/triage")
    public ResponseEntity<Map<String, Object>> triage(@PathVariable String sessionId,
                                                        @RequestBody TriageRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        sessionStore.upsertReconcileTriage(sessionId, req.fieldKey(), req.decision());
        eventBus.reconcileTriaged(sessionId, req.fieldKey(), req.decision(), req.officerId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/lock")
    public ResponseEntity<Map<String, Object>> lock(@PathVariable String sessionId,
                                                      @RequestBody LockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        sessionStore.lockSession(sessionId, req.officerId());
        eventBus.locked(sessionId, req.officerId());
        return ResponseEntity.ok(Map.of("ok", true, "lockedAt", Instant.now().toString()));
    }

    @PostMapping("/unlock")
    public ResponseEntity<Map<String, Object>> unlock(@PathVariable String sessionId,
                                                       @RequestBody UnlockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        sessionStore.unlockSession(sessionId, req.officerId());
        eventBus.unlocked(sessionId, req.officerId(), req.reason());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ── builders ──────────────────────────────────────────────────────────

    private List<ReconcileResponse.ReconRow> buildRowsFromCtx(List<ReconField> reconFields) {
        List<ReconcileResponse.ReconRow> out = new ArrayList<>(reconFields.size());
        for (ReconField rf : reconFields) {
            FieldDefinition fd = fieldPool.byKey(rf.fieldKey()).orElse(null);
            String group = groupOf(rf.fieldKey());
            String fieldType = fd != null ? fd.type().name() : "STRING";

            Map<String, Object> flatValues = new LinkedHashMap<>();
            Map<String, ReconcileResponse.ReconCell> cells = new LinkedHashMap<>();
            for (var e : rf.valueByDocType().entrySet()) {
                flatValues.put(e.getKey().name(), e.getValue() == null ? null : e.getValue().toString());
            }
            for (var e : rf.cellStatus().entrySet()) {
                String dt = e.getKey().name();
                Object v = rf.valueByDocType().get(e.getKey());
                String detail = rf.cellDetail().get(e.getKey());
                cells.put(dt, new ReconcileResponse.ReconCell(
                        v == null ? null : v.toString(), e.getValue().name(), detail, null));
            }
            out.add(new ReconcileResponse.ReconRow(
                    rf.fieldKey(), rf.nameEn(), null, group, fieldType,
                    flatValues, cells, rf.status().name(), rf.discrepancyDetail()));
        }
        return out;
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
                Map<String, Object> values = (Map<String, Object>) m.getOrDefault("valueByDocType", Map.of());
                // Best-effort cells (legacy data may not have per-cell verdicts)
                Map<String, ReconcileResponse.ReconCell> cells = new LinkedHashMap<>();
                for (var e : values.entrySet()) {
                    cells.put(e.getKey(), new ReconcileResponse.ReconCell(
                            e.getValue() == null ? null : e.getValue().toString(),
                            "MATCH", null, null));
                }
                out.add(new ReconcileResponse.ReconRow(
                        fk,
                        str(m.getOrDefault("label", fk)),
                        str(m.get("article")),
                        str(m.getOrDefault("group", "Other")),
                        "STRING",
                        values,
                        cells,
                        str(m.getOrDefault("verdict", "NA")),
                        str(m.get("discrepancyDetail"))));
            }
            return out;
        } catch (Exception e) {
            log.warn("[{}] reconcile parse from final_report failed: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    private List<ReconcileResponse.CellDecision> readCellDecisions(String sessionId) {
        var rows = sessionStore.getCellDecisions(sessionId);
        List<ReconcileResponse.CellDecision> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            out.add(new ReconcileResponse.CellDecision(
                    str(r.get("field_key")),
                    str(r.get("doc_type")),
                    str(r.get("decision")),
                    str(r.get("note")),
                    str(r.get("officer_id")),
                    toInstant(r.get("decided_at"))));
        }
        return out;
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

    /** Field-key → review-priority group. Mirrors the UI's reconcileGroups.js. */
    private static String groupOf(String key) {
        if (key == null) return "Other";
        String k = key.toLowerCase();
        if (k.contains("lc_number") || k.contains("beneficiary") || k.contains("applicant") || k.contains("issuing_bank")) return "Identity";
        if (k.contains("amount") || k.contains("currency") || k.contains("tolerance") || k.contains("available_with")) return "Money";
        if (k.contains("goods") || k.contains("hs_code") || k.contains("quantity") || k.contains("unit_price")) return "Goods";
        if (k.contains("port_of") || k.contains("shipment") || k.contains("transhipment") || k.contains("on_board")) return "Transport";
        if (k.contains("expiry") || k.contains("presentation") || k.contains("incoterms")) return "Compliance";
        if (k.contains("insurance")) return "Insurance";
        return "Other";
    }
}
