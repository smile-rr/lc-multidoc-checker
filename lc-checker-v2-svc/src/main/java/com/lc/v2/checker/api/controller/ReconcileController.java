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

        // Lock state from v_lock_state (latest lock/unlock action)
        Map<String, Object> lockState = sessionStore.getLockState(sessionId);
        boolean locked = lockState != null && Boolean.TRUE.equals(lockState.get("locked"));
        Instant lockedAt = lockState == null ? null : toInstant(lockState.get("locked_at"));
        String lockedBy = lockState == null ? null : (String) lockState.get("locked_by_officer");

        // Reconcile rows: prefer in-memory ctx (live during pipeline run);
        // fall back to v_reconcile_rows (post-restart / completed sessions).
        StageContext ctx = pipelineService.getContext(sessionId);
        List<ReconcileResponse.ReconRow> rows = (ctx != null && ctx.reconFields != null)
                ? buildRowsFromCtx(ctx.reconFields)
                : buildRowsFromView(sessionId);

        // Cell decisions from v_cell_decisions
        List<ReconcileResponse.CellDecision> decisions = readCellDecisions(sessionId);

        return ResponseEntity.ok(new ReconcileResponse(
                rows, locked, lockedAt, lockedBy, Map.of(), decisions));
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
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("decision", req.decision());
            sessionStore.appendOfficerAction(sessionId, "cell_decision",
                    req.fieldKey() + ":" + req.docType(),
                    objectMapper.writeValueAsString(payload),
                    req.officerId(), req.note());
        } catch (Exception e) {
            log.warn("[{}] officer_actions append failed for cell_decision: {}", sessionId, e.getMessage());
        }
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
        sessionStore.appendOfficerAction(sessionId, "cell_decision_cleared",
                req.fieldKey() + ":" + req.docType(),
                "{}", req.officerId(), null);
        eventBus.reconcileCellCleared(sessionId, req.fieldKey(), req.docType(), req.officerId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /**
     * Legacy row-level triage. Cell decisions superseded this; we keep the
     * endpoint accepting the request (frontend may still call it) but the
     * decision is logged as a cell_decision targeting the row's first doc.
     * No-op semantically — the row-level triage map is empty in responses.
     */
    @PostMapping("/reconcile/triage")
    public ResponseEntity<Map<String, Object>> triage(@PathVariable String sessionId,
                                                        @RequestBody TriageRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        eventBus.reconcileTriaged(sessionId, req.fieldKey(), req.decision(), req.officerId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/lock")
    public ResponseEntity<Map<String, Object>> lock(@PathVariable String sessionId,
                                                      @RequestBody LockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        sessionStore.appendOfficerAction(sessionId, "lock", "-",
                "{}", req.officerId(), null);
        eventBus.locked(sessionId, req.officerId());
        return ResponseEntity.ok(Map.of("ok", true, "lockedAt", Instant.now().toString()));
    }

    @PostMapping("/unlock")
    public ResponseEntity<Map<String, Object>> unlock(@PathVariable String sessionId,
                                                       @RequestBody UnlockRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();
        String unlockPayload = req.reason() == null
                ? "{}"
                : "{\"reason\":" + jsonStringLit(req.reason()) + "}";
        sessionStore.appendOfficerAction(sessionId, "unlock", "-",
                unlockPayload, req.officerId(), req.reason());
        eventBus.unlocked(sessionId, req.officerId(), req.reason());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private static String jsonStringLit(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    // ── builders ──────────────────────────────────────────────────────────

    private List<ReconcileResponse.ReconRow> buildRowsFromCtx(List<ReconField> reconFields) {
        List<ReconcileResponse.ReconRow> out = new ArrayList<>(reconFields.size());
        long withValues = reconFields.stream().filter(rf ->
                rf.valueByDocType() != null && !rf.valueByDocType().isEmpty()).count();
        log.debug("buildRowsFromCtx: {} fields, {} with values", reconFields.size(), withValues);
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

    /**
     * Build rows from {@code v_reconcile_rows}. Used when the in-memory
     * StageContext has been evicted (post-restart, completed sessions).
     */
    @SuppressWarnings("unchecked")
    private List<ReconcileResponse.ReconRow> buildRowsFromView(String sessionId) {
        List<Map<String, Object>> rows = sessionStore.getReconcileRows(sessionId);
        if (rows.isEmpty()) return List.of();
        List<ReconcileResponse.ReconRow> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            String fk = str(r.get("field_key"));
            if (fk == null) continue;
            Map<String, Object> values = parseObjectMap((String) r.get("value_by_doc_type"));
            Map<String, Object> cellStatus = parseObjectMap((String) r.get("cell_status"));
            Map<String, Object> cellDetail = parseObjectMap((String) r.get("cell_detail"));
            String rowVerdict = str(r.getOrDefault("row_verdict", "NA"));
            java.util.LinkedHashSet<String> dts = new java.util.LinkedHashSet<>();
            dts.addAll(cellStatus.keySet());
            dts.addAll(values.keySet());
            Map<String, ReconcileResponse.ReconCell> cells = new LinkedHashMap<>();
            for (String dt : dts) {
                Object v = values.get(dt);
                String verdict = str(cellStatus.getOrDefault(dt, rowVerdict));
                String detail = str(cellDetail.get(dt));
                cells.put(dt, new ReconcileResponse.ReconCell(
                        v == null ? null : v.toString(), verdict, detail, null));
            }
            out.add(new ReconcileResponse.ReconRow(
                    fk,
                    str(r.getOrDefault("label", fk)),
                    null,
                    str(r.getOrDefault("field_group", "Other")),
                    str(r.getOrDefault("field_type", "STRING")),
                    values,
                    cells,
                    rowVerdict,
                    str(r.get("discrepancy_detail"))));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseObjectMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> m = objectMapper.readValue(json, Map.class);
            return m == null ? Map.of() : m;
        } catch (Exception e) {
            return Map.of();
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
