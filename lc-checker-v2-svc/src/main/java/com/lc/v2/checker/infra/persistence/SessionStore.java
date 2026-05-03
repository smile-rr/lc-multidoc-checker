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
 * JDBC store for the lc_v2 schema.
 * Covers check_sessions, documents, pipeline_events.
 * Fail-fast at individual operations; caller handles error propagation.
 */
@Component
public class SessionStore {

    private static final Logger log = LoggerFactory.getLogger(SessionStore.class);
    private final JdbcTemplate jdbc;

    public SessionStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Create a new session row and return the generated UUID. */
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
        jdbc.update("""
                UPDATE lc_v2.check_sessions SET status = ? WHERE id = ?::uuid
                """, status, sessionId);
    }

    /**
     * Mark a session as awaiting officer input before the next stage.
     * Stamps the just-completed stage's timestamp into stage_completed_at JSONB.
     */
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

    /** Clear the awaiting flag when an officer triggers the next stage. */
    public void clearAwaitingOfficer(String sessionId, String runningStage) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = ?, awaiting_officer = FALSE, next_stage = NULL
                WHERE id = ?::uuid
                """, runningStage.toUpperCase(), sessionId);
    }

    /** Returns the next stage the officer is expected to trigger, or null. */
    public String getNextStage(String sessionId) {
        var rows = jdbc.queryForList(
                "SELECT next_stage FROM lc_v2.check_sessions WHERE id = ?::uuid", sessionId);
        if (rows.isEmpty()) return null;
        Object v = rows.get(0).get("next_stage");
        return v == null ? null : v.toString();
    }

    public void updateCompleted(String sessionId, Boolean compliant, String finalReportJson) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = 'COMPLETED', compliant = ?, final_report = ?::jsonb, completed_at = NOW()
                WHERE id = ?::uuid
                """, compliant, finalReportJson, sessionId);
    }

    public void updateFailed(String sessionId, String error) {
        jdbc.update("""
                UPDATE lc_v2.check_sessions
                SET status = 'FAILED', error = ?, completed_at = NOW()
                WHERE id = ?::uuid
                """, error, sessionId);
    }

    /** Create a document row for an uploaded file. Returns document UUID. */
    public String createDocument(String sessionId, DocType docType,
                                  String originalFilename, int pageCount) {
        String docId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO lc_v2.documents
                  (id, session_id, doc_type, original_filename, page_count, parse_status, created_at)
                VALUES (?::uuid, ?::uuid, ?, ?, ?, 'PENDING', NOW())
                """, docId, sessionId, docType.name(), originalFilename, pageCount);
        return docId;
    }

    public void updateDocumentStatusByType(String sessionId, String docType, String parseStatus) {
        jdbc.update("""
                UPDATE lc_v2.documents SET parse_status = ?
                WHERE session_id = ?::uuid AND doc_type = ?
                """, parseStatus, sessionId, docType);
    }

    public void updateDocumentStatus(String documentId, String parseStatus) {
        jdbc.update("""
                UPDATE lc_v2.documents SET parse_status = ? WHERE id = ?::uuid
                """, parseStatus, documentId);
    }

    /** Persist a pipeline event (for SSE replay and trace). */
    public void appendEvent(String sessionId, long seq, String eventJson) {
        jdbc.update("""
                INSERT INTO lc_v2.pipeline_events (session_id, seq, event, created_at)
                VALUES (?::uuid, ?, ?::jsonb, NOW())
                ON CONFLICT (session_id, seq) DO NOTHING
                """, sessionId, seq, eventJson);
    }

    /** List all sessions ordered by creation time desc, up to limit. */
    public List<Map<String, Object>> listSessions(int limit) {
        return jdbc.queryForList("""
                SELECT s.id, s.status, s.compliant, s.doc_count, s.created_at, s.completed_at,
                       s.error,
                       (SELECT er.fields->>'lc_number'
                        FROM lc_v2.documents d
                        JOIN lc_v2.extraction_results er ON er.document_id = d.id AND er.is_consensus
                        WHERE d.session_id = s.id AND d.doc_type = 'LC' LIMIT 1) AS lc_number,
                       (SELECT er.fields->>'beneficiary_name'
                        FROM lc_v2.documents d
                        JOIN lc_v2.extraction_results er ON er.document_id = d.id AND er.is_consensus
                        WHERE d.session_id = s.id AND d.doc_type = 'LC' LIMIT 1) AS beneficiary_name
                FROM lc_v2.check_sessions s
                ORDER BY s.created_at DESC
                LIMIT ?
                """, limit);
    }

    /** Get a single session by ID (with document list). */
    public Map<String, Object> getSession(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, status, compliant, doc_count, error, created_at, completed_at,
                       next_stage, awaiting_officer, stage_completed_at::text AS stage_completed_at,
                       final_report::text AS final_report
                FROM lc_v2.check_sessions WHERE id = ?::uuid
                """, sessionId);
        if (rows.isEmpty()) return null;
        Map<String, Object> session = rows.get(0);
        session.put("documents", getDocuments(sessionId));
        return session;
    }

    public List<Map<String, Object>> getDocuments(String sessionId) {
        return jdbc.queryForList("""
                SELECT id, doc_type, original_filename, parse_status, page_count, created_at
                FROM lc_v2.documents WHERE session_id = ?::uuid ORDER BY created_at
                """, sessionId);
    }

    /** Get pipeline events for trace replay. Returns events with type/ts/seq top-level for the frontend. */
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

    public boolean sessionExists(String sessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lc_v2.check_sessions WHERE id = ?::uuid",
                Integer.class, sessionId);
        return count != null && count > 0;
    }

    // ───────────────────────────────────────────────────────────────────────
    // Documents — extended access for officer actions
    // ───────────────────────────────────────────────────────────────────────

    public Map<String, Object> getDocument(String docId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, session_id, doc_type, original_filename, file_sha256,
                       page_count, parse_status, classification_conf,
                       confirmed_by_officer, created_at
                FROM lc_v2.documents WHERE id = ?::uuid
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
        if (first) return; // nothing to patch
        sql.append(" WHERE id = ?::uuid");
        params.add(docId);
        jdbc.update(sql.toString(), params.toArray());
    }

    // ───────────────────────────────────────────────────────────────────────
    // Extraction results
    // ───────────────────────────────────────────────────────────────────────

    /** All extraction-result rows for a single document (one per slot + consensus row). */
    public List<Map<String, Object>> getExtractionResults(String documentId) {
        return jdbc.queryForList("""
                SELECT id, document_id, session_id, extractor_slot,
                       fields::text AS fields, off_schema_items::text AS off_schema_items,
                       overall_confidence, is_consensus, extracted_at
                FROM lc_v2.extraction_results
                WHERE document_id = ?::uuid
                ORDER BY is_consensus DESC, extracted_at
                """, documentId);
    }

    /** Insert one extraction-result row (called by ParseStage for each slot + consensus). */
    public void insertExtractionResult(String documentId, String sessionId, String slot,
                                        String fieldsJson, String offSchemaJson,
                                        Double overallConfidence, boolean isConsensus) {
        jdbc.update("""
                INSERT INTO lc_v2.extraction_results
                  (document_id, session_id, extractor_slot, fields, off_schema_items,
                   overall_confidence, is_consensus, extracted_at)
                VALUES (?::uuid, ?::uuid, ?, ?::jsonb, ?::jsonb, ?, ?, NOW())
                """, documentId, sessionId, slot, fieldsJson, offSchemaJson,
                overallConfidence, isConsensus);
    }

    /** Officer field correction → updates the consensus row's JSONB in-place. */
    public void upsertFieldCorrection(String documentId, String fieldKey, String value, String note) {
        // Ensure a consensus row exists; if not, create an empty one.
        Integer existing = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lc_v2.extraction_results WHERE document_id = ?::uuid AND is_consensus",
                Integer.class, documentId);
        if (existing == null || existing == 0) {
            jdbc.update("""
                    INSERT INTO lc_v2.extraction_results
                      (document_id, session_id, extractor_slot, fields, is_consensus, extracted_at)
                    SELECT ?::uuid, session_id, 'consensus', '{}'::jsonb, true, NOW()
                    FROM lc_v2.documents WHERE id = ?::uuid
                    """, documentId, documentId);
        }
        // jsonb_set with the corrected value envelope
        String envelope = String.format(
                "{\"value\": %s, \"confidence\": \"HIGH\", \"manual\": true, \"note\": %s}",
                jsonStringLit(value), note == null ? "null" : jsonStringLit(note));
        jdbc.update("""
                UPDATE lc_v2.extraction_results
                SET fields = jsonb_set(fields, ?::text[], ?::jsonb, true)
                WHERE document_id = ?::uuid AND is_consensus
                """, "{" + fieldKey + "}", envelope, documentId);
    }

    private static String jsonStringLit(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    // ───────────────────────────────────────────────────────────────────────
    // Reconcile state
    // ───────────────────────────────────────────────────────────────────────

    public Map<String, Object> getReconcileState(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT session_id, locked, locked_at, locked_by_officer,
                       triage::text AS triage, created_at
                FROM lc_v2.reconcile_state WHERE session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void ensureReconcileRow(String sessionId) {
        jdbc.update("""
                INSERT INTO lc_v2.reconcile_state (session_id, locked, triage, created_at)
                VALUES (?::uuid, false, '{}'::jsonb, NOW())
                ON CONFLICT (session_id) DO NOTHING
                """, sessionId);
    }

    public void upsertReconcileTriage(String sessionId, String fieldKey, String decision) {
        ensureReconcileRow(sessionId);
        jdbc.update("""
                UPDATE lc_v2.reconcile_state
                SET triage = jsonb_set(triage, ?::text[], to_jsonb(?::text), true)
                WHERE session_id = ?::uuid
                """, "{" + fieldKey + "}", decision, sessionId);
    }

    public void lockSession(String sessionId, String officerId) {
        ensureReconcileRow(sessionId);
        jdbc.update("""
                UPDATE lc_v2.reconcile_state
                SET locked = true, locked_at = NOW(), locked_by_officer = ?
                WHERE session_id = ?::uuid
                """, officerId, sessionId);
    }

    public void unlockSession(String sessionId, String officerId) {
        jdbc.update("""
                UPDATE lc_v2.reconcile_state
                SET locked = false, locked_at = NULL, locked_by_officer = NULL
                WHERE session_id = ?::uuid
                """, sessionId);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Examine overrides
    // ───────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getOverrides(String sessionId) {
        return jdbc.queryForList("""
                SELECT id, session_id, rule_id, new_status, reason, note, flagged, created_at
                FROM lc_v2.examine_overrides
                WHERE session_id = ?::uuid
                ORDER BY created_at DESC
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

    public void insertOverride(String sessionId, String ruleId, String newStatus,
                                String reason, String note, boolean flagged) {
        jdbc.update("""
                INSERT INTO lc_v2.examine_overrides
                  (session_id, rule_id, new_status, reason, note, flagged, created_at)
                VALUES (?::uuid, ?, ?, ?, ?, ?, NOW())
                """, sessionId, ruleId, newStatus, reason, note, flagged);
    }

    public void deleteOverridesForRule(String sessionId, String ruleId) {
        jdbc.update("""
                DELETE FROM lc_v2.examine_overrides
                WHERE session_id = ?::uuid AND rule_id = ?
                """, sessionId, ruleId);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Sign-off
    // ───────────────────────────────────────────────────────────────────────

    public Map<String, Object> getSignoff(String sessionId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, session_id, decision,
                       discrepancy_dispositions::text AS discrepancy_dispositions,
                       officer_note, signed_at, officer_id, frozen
                FROM lc_v2.signoff WHERE session_id = ?::uuid
                """, sessionId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void insertSignoff(String sessionId, String decision, String dispositionsJson,
                               String officerNote, String officerId) {
        jdbc.update("""
                INSERT INTO lc_v2.signoff
                  (session_id, decision, discrepancy_dispositions, officer_note,
                   signed_at, officer_id, frozen)
                VALUES (?::uuid, ?, ?::jsonb, ?, NOW(), ?, true)
                ON CONFLICT (session_id) DO UPDATE SET
                  decision = EXCLUDED.decision,
                  discrepancy_dispositions = EXCLUDED.discrepancy_dispositions,
                  officer_note = EXCLUDED.officer_note,
                  signed_at = EXCLUDED.signed_at,
                  officer_id = EXCLUDED.officer_id,
                  frozen = true
                """, sessionId, decision, dispositionsJson, officerNote, officerId);
    }

    public boolean isSigned(String sessionId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM lc_v2.signoff WHERE session_id = ?::uuid AND frozen",
                Integer.class, sessionId);
        return count != null && count > 0;
    }

    // ───────────────────────────────────────────────────────────────────────
    // Re-run support: clear downstream rows when the officer re-runs from a stage
    // ───────────────────────────────────────────────────────────────────────

    /**
     * Wipe rows that belong to {@code fromStage} and every downstream stage.
     * Caller is responsible for resetting the in-memory {@link com.lc.v2.checker.pipeline.StageContext}
     * fields and the in-process {@link com.lc.v2.checker.infra.storage.PdfBytesCache}
     * for the matching docIds.
     *
     * Stage cascade (each row applies if fromStage <= the listed stage):
     *   intake    → documents, extraction_results, reconcile_state, examine_overrides, signoff
     *   parse     → extraction_results, reconcile_state, examine_overrides, signoff
     *   reconcile → reconcile_state, examine_overrides, signoff
     *   examine   → examine_overrides, signoff
     *   signoff   → signoff
     */
    public void clearDownstreamState(String sessionId, String fromStage) {
        String stage = fromStage == null ? "" : fromStage.toLowerCase();
        // All-clear → return list of doc IDs so caller can purge the PDF cache.
        if (stage.equals("intake")) {
            jdbc.update("DELETE FROM lc_v2.signoff             WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.examine_overrides   WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.reconcile_state     WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.extraction_results  WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.documents           WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.check_sessions SET final_report = NULL, compliant = NULL, error = NULL, status = 'INTAKE', completed_at = NULL WHERE id = ?::uuid", sessionId);
            return;
        }
        if (stage.equals("parse")) {
            jdbc.update("DELETE FROM lc_v2.signoff             WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.examine_overrides   WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.reconcile_state     WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.extraction_results  WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.documents SET parse_status = 'PENDING', confirmed_by_officer = false WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.check_sessions SET final_report = NULL, compliant = NULL, error = NULL, status = 'PARSE', completed_at = NULL WHERE id = ?::uuid", sessionId);
            return;
        }
        if (stage.equals("reconcile")) {
            jdbc.update("DELETE FROM lc_v2.signoff             WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.examine_overrides   WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.reconcile_state     WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.check_sessions SET final_report = NULL, compliant = NULL, error = NULL, status = 'RECONCILE', completed_at = NULL WHERE id = ?::uuid", sessionId);
            return;
        }
        if (stage.equals("examine")) {
            jdbc.update("DELETE FROM lc_v2.signoff             WHERE session_id = ?::uuid", sessionId);
            jdbc.update("DELETE FROM lc_v2.examine_overrides   WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.check_sessions SET final_report = NULL, compliant = NULL, error = NULL, status = 'EXAMINE', completed_at = NULL WHERE id = ?::uuid", sessionId);
            return;
        }
        if (stage.equals("signoff")) {
            jdbc.update("DELETE FROM lc_v2.signoff WHERE session_id = ?::uuid", sessionId);
            jdbc.update("UPDATE lc_v2.check_sessions SET status = 'SIGNOFF', completed_at = NULL WHERE id = ?::uuid", sessionId);
            return;
        }
        log.warn("clearDownstreamState: unknown stage '{}'", fromStage);
    }

    /** Return the list of document ids for a session — used by re-run to evict the PDF cache. */
    public List<String> getDocumentIds(String sessionId) {
        return jdbc.query(
                "SELECT id::text FROM lc_v2.documents WHERE session_id = ?::uuid",
                (rs, n) -> rs.getString(1),
                sessionId);
    }
}
