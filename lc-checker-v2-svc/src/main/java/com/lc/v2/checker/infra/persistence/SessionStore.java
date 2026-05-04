package com.lc.v2.checker.infra.persistence;

import com.lc.v2.checker.domain.common.DocType;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * JDBC store for the lc_v2 schema (six tables: check_sessions, documents,
 * pipeline_steps, pipeline_events, officer_actions, dynamic_rules).
 *
 * <p>Conventions:
 * <ul>
 *   <li><b>System outputs</b> are upserted into {@code pipeline_steps} via
 *       {@link #upsertPipelineStep}. Idempotent — re-running a stage overwrites
 *       the prior row keyed by {@code (session_id, stage, step_key)}.</li>
 *   <li><b>Officer mutations</b> are appended to {@code officer_actions} via
 *       {@link #appendOfficerAction}. Append-only audit log; "current state"
 *       is the latest row per {@code (action, target)}, exposed via views.</li>
 *   <li><b>Reads</b> go through views (v_lc_parse, v_reconcile_rows,
 *       v_check_results, v_cell_decisions, v_rule_overrides, v_signoff, …).
 *       Callers never see JSONB shape directly.</li>
 * </ul>
 */
@Component
public class SessionStore {

    private static final Logger log = LoggerFactory.getLogger(SessionStore.class);
    private final JdbcTemplate jdbc;

    public SessionStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // ───────────────────────────────────────────────────────────────────────
    // check_sessions
    // ───────────────────────────────────────────────────────────────────────

    public String createSession(int docCount) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO lc_v2.check_sessions (id, status, doc_count, created_at)
                VALUES (?::uuid, 'QUEUED', ?, NOW())
                """, id, docCount);
        log.info("Created session: {}", id);
        return id;
    }

    public void updateStatus(String sessionId, String status) {
        jdbc.update("UPDATE lc_v2.check_sessions SET status = ? WHERE id = ?::uuid",
                status, sessionId);
    }

    public void markAwaitingOfficer(String sessionId, String justCompleted, String nextStage) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = 'AWAITING_OFFICER',
                    awaiting_officer = TRUE,
                    next_stage = ?,
                    stage_completed_at = stage_completed_at
                        || jsonb_build_object(?, to_jsonb(NOW()::text))
                WHERE id = ?::uuid
                """, nextStage, justCompleted, sessionId);
    }

    public void clearAwaitingOfficer(String sessionId, String runningStage) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = ?, awaiting_officer = FALSE, next_stage = NULL
                WHERE id = ?::uuid
                """, runningStage.toUpperCase(), sessionId);
    }

    public String getNextStage(String sessionId) {
        var rows = jdbc.queryForList(
                "SELECT next_stage FROM lc_v2.check_sessions WHERE id = ?::uuid", sessionId);
        if (rows.isEmpty()) return null;
        Object v = rows.get(0).get("next_stage");
        return v == null ? null : v.toString();
    }

    /**
     * Mark the session COMPLETED. {@code compliant} is the system verdict.
     * The "final report" lives in pipeline_steps(signoff/report) — written by
     * PipelineService at finalize. This call only updates session-level scalars.
     */
    public void updateCompleted(String sessionId, Boolean compliant) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = 'COMPLETED',
                    compliant = ?,
                    completed_at = NOW()
                WHERE id = ?::uuid
                """, compliant, sessionId);
    }

    public void updateFailed(String sessionId, String error) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = 'FAILED', error = ?, completed_at = NOW()
                WHERE id = ?::uuid
                """, error, sessionId);
    }

    public boolean sessionExists(String sessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lc_v2.check_sessions WHERE id = ?::uuid",
                Integer.class, sessionId);
        return count != null && count > 0;
    }

    /** List sessions for the home page. lc_number / beneficiary_name come from v_session_overview. */
    public List<Map<String, Object>> listSessions(int limit) {
        return jdbc.queryForList("""
                SELECT session_id::text AS id,
                       status, compliant, doc_count, created_at, completed_at,
                       error, next_stage, awaiting_officer,
                       stage_completed_at::text AS stage_completed_at,
                       lc_number, beneficiary_name
                FROM   lc_v2.v_session_overview
                ORDER  BY created_at DESC
                LIMIT  ?
                """, limit);
    }

    /**
     * Get a single session with documents list. {@code final_report} is no
     * longer a column — callers that need the report read v_signoff_report.
     */
    public Map<String, Object> getSession(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, status, compliant, doc_count, error, created_at, completed_at,
                       next_stage, awaiting_officer, stage_completed_at::text AS stage_completed_at
                FROM   lc_v2.check_sessions WHERE id = ?::uuid
                """, sessionId);
        if (rows.isEmpty()) return null;
        Map<String, Object> session = rows.get(0);
        session.put("documents", getDocuments(sessionId));
        return session;
    }

    // ───────────────────────────────────────────────────────────────────────
    // documents
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Create a document row. Filename-classified docs auto-confirm (the
     * registry is the system's source of truth); only {@code UNKNOWN} docs
     * require officer confirmation via {@link #patchDocument}.
     */
    public String createDocument(String sessionId, DocType docType,
                                  String originalFilename, int pageCount) {
        String docId = UUID.randomUUID().toString();
        boolean autoConfirmed = docType != DocType.UNKNOWN;
        jdbc.update("""
                INSERT INTO lc_v2.documents
                  (id, session_id, doc_type, original_filename, page_count,
                   parse_status, confirmed_by_officer, created_at)
                VALUES (?::uuid, ?::uuid, ?, ?, ?, 'PENDING', ?, NOW())
                """, docId, sessionId, docType.name(), originalFilename, pageCount,
                autoConfirmed);
        return docId;
    }

    public void updateDocumentStatusByType(String sessionId, String docType, String parseStatus) {
        jdbc.update("""
                UPDATE lc_v2.documents SET parse_status = ?
                WHERE session_id = ?::uuid AND doc_type = ?
                """, parseStatus, sessionId, docType);
    }

    public void updateDocumentStatus(String documentId, String parseStatus) {
        jdbc.update("UPDATE lc_v2.documents SET parse_status = ? WHERE id = ?::uuid",
                parseStatus, documentId);
    }

    public List<Map<String, Object>> getDocuments(String sessionId) {
        return jdbc.queryForList("""
                SELECT id, doc_type, original_filename, parse_status, page_count,
                       confirmed_by_officer, created_at
                FROM   lc_v2.documents WHERE session_id = ?::uuid ORDER BY created_at
                """, sessionId);
    }

    public Map<String, Object> getDocument(String docId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, session_id, doc_type, original_filename, file_sha256,
                       page_count, parse_status, classification_conf,
                       confirmed_by_officer, created_at
                FROM   lc_v2.documents WHERE id = ?::uuid
                """, docId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Patch a document row. Pass null fields to leave them unchanged. */
    public void patchDocument(String docId, String docType, String parseStatus,
                              Boolean confirmedByOfficer) {
        StringBuilder sql = new StringBuilder("UPDATE lc_v2.documents SET ");
        List<Object> params = new java.util.ArrayList<>();
        boolean first = true;
        if (docType != null) {
            sql.append("doc_type = ?"); params.add(docType); first = false;
        }
        if (parseStatus != null) {
            if (!first) sql.append(", ");
            sql.append("parse_status = ?"); params.add(parseStatus); first = false;
        }
        if (confirmedByOfficer != null) {
            if (!first) sql.append(", ");
            sql.append("confirmed_by_officer = ?"); params.add(confirmedByOfficer); first = false;
        }
        if (first) return;
        sql.append(" WHERE id = ?::uuid");
        params.add(docId);
        jdbc.update(sql.toString(), params.toArray());
    }

    public List<String> getDocumentIds(String sessionId) {
        return jdbc.query(
                "SELECT id::text FROM lc_v2.documents WHERE session_id = ?::uuid",
                (rs, n) -> rs.getString(1),
                sessionId);
    }

    // ───────────────────────────────────────────────────────────────────────
    // pipeline_steps — unified system-output store
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Upsert one row in pipeline_steps. Stage outputs are idempotent — re-running
     * the same stage overwrites the prior row keyed by (session, stage, step_key).
     */
    public void upsertPipelineStep(String sessionId, String stage, String stepKey,
                                    String status, String resultJson,
                                    Long durationMs, String error) {
        if (resultJson == null || resultJson.isBlank()) resultJson = "{}";
        jdbc.update("""
                INSERT INTO lc_v2.pipeline_steps
                  (session_id, stage, step_key, status, started_at, completed_at,
                   duration_ms, result, error, created_at)
                VALUES (?::uuid, ?, ?, ?, NOW(), NOW(), ?, ?::jsonb, ?, NOW())
                ON CONFLICT (session_id, stage, step_key) DO UPDATE
                SET status       = EXCLUDED.status,
                    completed_at = EXCLUDED.completed_at,
                    duration_ms  = EXCLUDED.duration_ms,
                    result       = EXCLUDED.result,
                    error        = EXCLUDED.error
                """, sessionId, stage, stepKey, status, durationMs, resultJson, error);
    }

    /** Read the result JSONB of a single pipeline step (raw text); null if absent. */
    public String getPipelineStepResult(String sessionId, String stage, String stepKey) {
        try {
            return jdbc.queryForObject("""
                    SELECT result::text FROM lc_v2.pipeline_steps
                    WHERE session_id = ?::uuid AND stage = ? AND step_key = ?
                    """, String.class, sessionId, stage, stepKey);
        } catch (org.springframework.dao.EmptyResultDataAccessException e) {
            return null;
        }
    }

    /** All check-result rows for a session, ordered by start time. */
    public List<Map<String, Object>> getCheckResults(String sessionId) {
        return jdbc.queryForList("""
                SELECT rule_id, check_type, system_verdict, confidence,
                       explanation, evidence::text AS evidence,
                       trigger_trace::text AS trigger_trace,
                       duration_ms, started_at, completed_at, error
                FROM   lc_v2.v_check_results
                WHERE  session_id = ?::uuid
                ORDER  BY started_at, rule_id
                """, sessionId);
    }

    /** Reconcile rows for a session, ordered by group then field key. */
    public List<Map<String, Object>> getReconcileRows(String sessionId) {
        return jdbc.queryForList("""
                SELECT field_key, label, field_group, field_type, row_verdict,
                       discrepancy_detail,
                       value_by_doc_type::text AS value_by_doc_type,
                       cell_status::text       AS cell_status,
                       cell_detail::text       AS cell_detail
                FROM   lc_v2.v_reconcile_rows
                WHERE  session_id = ?::uuid
                ORDER  BY field_group NULLS LAST, field_key
                """, sessionId);
    }

    /** LC parse view as a Map (raw_mt700, fields, raw_fields, derived, warnings); null if absent. */
    public Map<String, Object> getLcParse(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT raw_mt700,
                       fields::text     AS fields,
                       raw_fields::text AS raw_fields,
                       derived::text    AS derived,
                       warnings::text   AS warnings,
                       parsed_at
                FROM   lc_v2.v_lc_parse
                WHERE  session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** examine/meta result — adhoc rules, consistency, trigger traces. */
    public Map<String, Object> getExamineMeta(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT adhoc_rules::text         AS adhoc_rules,
                       consistency_warnings::text AS consistency_warnings,
                       consistency::text         AS consistency,
                       trigger_traces::text      AS trigger_traces
                FROM   lc_v2.v_examine_meta
                WHERE  session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Per-doc consensus extract (fields, off-schema, overall_confidence); null if absent. */
    public Map<String, Object> getDocConsensus(String docId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT fields::text           AS fields,
                       off_schema_items::text AS off_schema_items,
                       overall_confidence,
                       extracted_at
                FROM   lc_v2.v_doc_extracts_consensus
                WHERE  document_id = ?::uuid
                """, docId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Per-doc per-slot extract rows. */
    public List<Map<String, Object>> getDocSlots(String docId) {
        return jdbc.queryForList("""
                SELECT slot, fields::text AS fields, extracted_at
                FROM   lc_v2.v_doc_extracts_slots
                WHERE  document_id = ?::uuid
                ORDER  BY slot
                """, docId);
    }

    // ───────────────────────────────────────────────────────────────────────
    // pipeline_events — append-only SSE replay tape
    // ───────────────────────────────────────────────────────────────────────

    public void appendEvent(String sessionId, long seq, String eventJson) {
        jdbc.update("""
                INSERT INTO lc_v2.pipeline_events (session_id, seq, event, created_at)
                VALUES (?::uuid, ?, ?::jsonb, NOW())
                ON CONFLICT (session_id, seq) DO NOTHING
                """, sessionId, seq, eventJson);
    }

    public List<Map<String, Object>> getEvents(String sessionId) {
        return jdbc.queryForList("""
                SELECT (event->>'seq')::bigint     AS seq,
                       (event->>'type')            AS type,
                       (event->>'ts')              AS ts,
                       (event->>'sessionId')       AS sessionId,
                       event
                FROM lc_v2.pipeline_events
                WHERE session_id = ?::uuid
                ORDER BY seq
                """, sessionId);
    }

    // ───────────────────────────────────────────────────────────────────────
    // officer_actions — append-only audit log
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Append one row to officer_actions. Append-only audit log; "current state"
     * of any officer-mutable thing is the latest row per (session, action, target).
     * Read via the views (v_cell_decisions / v_rule_overrides / v_lock_state /
     * v_field_corrections / v_signoff).
     */
    public void appendOfficerAction(String sessionId, String action, String target,
                                     String payloadJson, String officerId, String note) {
        if (payloadJson == null || payloadJson.isBlank()) payloadJson = "{}";
        jdbc.update("""
                INSERT INTO lc_v2.officer_actions
                  (session_id, action, target, payload, officer_id, note, acted_at)
                VALUES (?::uuid, ?, ?, ?::jsonb, ?, ?, NOW())
                """, sessionId, action, target, payloadJson, officerId, note);
    }

    /** Lock state (locked, locked_at, locked_by_officer). May return null. */
    public Map<String, Object> getLockState(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT locked, locked_at, locked_by_officer, unlock_reason
                FROM   lc_v2.v_lock_state WHERE session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<Map<String, Object>> getCellDecisions(String sessionId) {
        return jdbc.queryForList("""
                SELECT field_key, doc_type, decision, value, note, officer_id, decided_at
                FROM   lc_v2.v_cell_decisions
                WHERE  session_id = ?::uuid
                ORDER  BY decided_at
                """, sessionId);
    }

    public List<Map<String, Object>> getOverrides(String sessionId) {
        return jdbc.queryForList("""
                SELECT rule_id, new_status, reason, flagged, note, officer_id, created_at
                FROM   lc_v2.v_rule_overrides
                WHERE  session_id = ?::uuid
                ORDER  BY created_at DESC
                """, sessionId);
    }

    /** Latest override per rule (most recent wins). */
    public Map<String, Map<String, Object>> getLatestOverridesByRule(String sessionId) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : getOverrides(sessionId)) {
            String ruleId = (String) row.get("rule_id");
            result.putIfAbsent(ruleId, row);
        }
        return result;
    }

    /** All field corrections for a document (latest-wins per fieldKey, projected by view). */
    public List<Map<String, Object>> getFieldCorrections(String docId) {
        return jdbc.queryForList("""
                SELECT field_key, value, issue_kind, note, officer_id, corrected_at
                FROM   lc_v2.v_field_corrections
                WHERE  document_id = ?::uuid
                ORDER  BY field_key
                """, docId);
    }

    public Map<String, Object> getSignoff(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT decision,
                       discrepancy_dispositions::text AS discrepancy_dispositions,
                       officer_note, signed_at, officer_id, frozen
                FROM   lc_v2.v_signoff WHERE session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public boolean isSigned(String sessionId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM lc_v2.officer_actions
                WHERE session_id = ?::uuid AND action = 'signoff'
                """, Integer.class, sessionId);
        return count != null && count > 0;
    }

    // ───────────────────────────────────────────────────────────────────────
    // dynamic_rules — per-LC rules generated at runtime
    // ───────────────────────────────────────────────────────────────────────

    public void putDynamicRules(String cacheKey, String rulesJson) {
        jdbc.update("""
                INSERT INTO lc_v2.dynamic_rules (cache_key, rules_json, created_at)
                VALUES (?, ?::jsonb, NOW())
                ON CONFLICT (cache_key) DO UPDATE
                SET rules_json = EXCLUDED.rules_json,
                    created_at = NOW()
                """, cacheKey, rulesJson);
    }

    public String getDynamicRules(String cacheKey) {
        try {
            return jdbc.queryForObject(
                    "SELECT rules_json::text FROM lc_v2.dynamic_rules WHERE cache_key = ?",
                    String.class, cacheKey);
        } catch (org.springframework.dao.EmptyResultDataAccessException e) {
            return null;
        }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Re-run support — clear pipeline_steps for a stage and downstream.
    //
    // Officer actions are PRESERVED across reruns (audit trail). Only
    // system-output rows in pipeline_steps are wiped, allowing each stage
    // to re-emit its rows on the new run.
    // ───────────────────────────────────────────────────────────────────────

    private static final List<String> STAGE_ORDER = List.of(
            "intake", "parse", "reconcile", "examine", "signoff");

    public void clearDownstreamState(String sessionId, String fromStage) {
        String stage = fromStage == null ? "" : fromStage.toLowerCase();
        int idx = STAGE_ORDER.indexOf(stage);
        if (idx < 0) {
            log.warn("clearDownstreamState: unknown stage '{}'", fromStage);
            return;
        }
        // Wipe pipeline_steps for fromStage and every stage after it.
        List<String> stages = STAGE_ORDER.subList(idx, STAGE_ORDER.size());
        for (String s : stages) {
            jdbc.update("DELETE FROM lc_v2.pipeline_steps WHERE session_id = ?::uuid AND stage = ?",
                    sessionId, s);
        }
        // Reset session-level scalars.
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = ?, compliant = NULL, error = NULL, completed_at = NULL
                WHERE id = ?::uuid
                """, stage.toUpperCase(), sessionId);
        // Re-run from intake also wipes documents (the inputs).
        if (idx == 0) {
            jdbc.update("DELETE FROM lc_v2.documents WHERE session_id = ?::uuid", sessionId);
        } else if (idx == 1) {
            // Re-run from parse: documents reset to PENDING for re-extraction.
            jdbc.update("""
                    UPDATE lc_v2.documents SET parse_status = 'PENDING',
                                                confirmed_by_officer = false
                    WHERE session_id = ?::uuid
                    """, sessionId);
        }
    }
}
