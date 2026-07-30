package com.tb.helix.lccheck.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.lccheck.domain.StageId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Everything lc-check reads and writes.
 *
 * <p>One DAO rather than six, because the tables are one aggregate: a case and the rows
 * that hang off it. Splitting them would put a transaction boundary where there is no
 * boundary in the domain.
 *
 * <p>JDBC by hand, no ORM. The reads here are shaped for screens — a list view wants the
 * summary view, the workbench wants everything at once — and an object graph fetched
 * lazily is how a list view becomes a hundred queries.
 */
@Component
public class CaseStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public CaseStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    // --- Cases --------------------------------------------------------------

    public String create(String caseRef, String officerId) {
        return jdbc.queryForObject("""
                INSERT INTO helix_check.lc_case (case_ref, assigned_to, stage, status)
                VALUES (?, ?, 'intake', 'awaiting_check')
                RETURNING id::text
                """, String.class, caseRef, officerId);
    }

    public Optional<Map<String, Object>> find(String caseId) {
        var rows = jdbc.queryForList(
                "SELECT * FROM helix_check.lc_case WHERE id = ?::uuid", caseId);
        return rows.stream().findFirst();
    }

    public Optional<String> idForRef(String caseRef) {
        return jdbc.queryForList("SELECT id::text FROM helix_check.lc_case WHERE case_ref = ?",
                String.class, caseRef).stream().findFirst();
    }

    public List<Map<String, Object>> list(String scope, String officerId) {
        String where = switch (scope == null ? "all" : scope) {
            case "mine" -> " WHERE assigned_to = ?";
            case "due" -> " WHERE reply_due_days = 0";
            default -> "";
        };
        String sql = "SELECT * FROM helix_check.v_case_summary" + where + " ORDER BY created_at DESC";
        return where.contains("?") ? jdbc.queryForList(sql, officerId) : jdbc.queryForList(sql);
    }

    /** Patches scalar columns. Keys are column names; unknown keys would be a typo, so they throw. */
    public void patchCase(String caseId, Map<String, Object> values) {
        if (values.isEmpty()) return;
        String sets = String.join(", ", values.keySet().stream().map(k -> k + " = ?").toList());
        Object[] args = new Object[values.size() + 1];
        int i = 0;
        for (Object v : values.values()) args[i++] = v;
        args[i] = caseId;
        jdbc.update("UPDATE helix_check.lc_case SET " + sets + " WHERE id = ?::uuid", args);
    }

    public void setStage(String caseId, StageId stage, StageId next, boolean awaiting) {
        jdbc.update("""
                UPDATE helix_check.lc_case
                   SET stage = ?, next_stage = ?, awaiting_officer = ?,
                       stage_completed_at = stage_completed_at || jsonb_build_object(?, NOW()::text)
                 WHERE id = ?::uuid
                """, stage.key(), next == null ? null : next.key(), awaiting, stage.key(), caseId);
    }

    // --- Documents ----------------------------------------------------------

    public void upsertDocument(String caseId, String docCode, Map<String, Object> doc) {
        jdbc.update("""
                INSERT INTO helix_check.lc_document
                    (case_id, doc_code, role, doc_type_label, abbr, icon, file_name, reference,
                     page_from, page_to, pages, extraction_mode, low_confidence, scan_note, ordinal)
                VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (case_id, doc_code) DO UPDATE SET
                    doc_type_label = EXCLUDED.doc_type_label, abbr = EXCLUDED.abbr,
                    icon = EXCLUDED.icon, reference = EXCLUDED.reference,
                    page_from = EXCLUDED.page_from, page_to = EXCLUDED.page_to,
                    pages = EXCLUDED.pages, extraction_mode = EXCLUDED.extraction_mode,
                    low_confidence = EXCLUDED.low_confidence, scan_note = EXCLUDED.scan_note
                """,
                caseId, docCode, doc.get("role"), doc.get("docType"), doc.get("abbr"), doc.get("icon"),
                doc.get("fileName"), doc.get("reference"), doc.get("pageFrom"), doc.get("pageTo"),
                intArray((List<?>) doc.get("pages")), doc.getOrDefault("extraction", "ocr"),
                doc.getOrDefault("lowConfidence", false), doc.get("scanNote"),
                doc.getOrDefault("ordinal", 0));
    }

    public List<Map<String, Object>> documents(String caseId) {
        return jdbc.queryForList(
                "SELECT * FROM helix_check.lc_document WHERE case_id = ?::uuid ORDER BY ordinal, doc_code", caseId);
    }

    public void setBundlePage(String caseId, int pageNo, String docCode, String label) {
        jdbc.update("""
                INSERT INTO helix_check.lc_bundle_page (case_id, page_no, doc_code, label)
                VALUES (?::uuid, ?, ?, ?)
                ON CONFLICT (case_id, page_no) DO UPDATE SET doc_code = EXCLUDED.doc_code, label = EXCLUDED.label
                """, caseId, pageNo, docCode, label);
    }

    public List<Map<String, Object>> bundlePages(String caseId) {
        return jdbc.queryForList(
                "SELECT page_no, doc_code, label FROM helix_check.lc_bundle_page WHERE case_id = ?::uuid ORDER BY page_no",
                caseId);
    }

    // --- Steps --------------------------------------------------------------

    public void recordStep(String caseId, String stage, String stepKey, String status,
                           Object result, String error, boolean cacheHit, String derivationKey) {
        jdbc.update("""
                INSERT INTO helix_check.lc_step
                    (case_id, stage, step_key, status, completed_at, result, error, cache_hit, derivation_key)
                VALUES (?::uuid, ?, ?, ?, NOW(), ?::jsonb, ?, ?, ?)
                ON CONFLICT (case_id, stage, step_key) DO UPDATE SET
                    status = EXCLUDED.status, completed_at = NOW(), result = EXCLUDED.result,
                    error = EXCLUDED.error, cache_hit = EXCLUDED.cache_hit,
                    derivation_key = EXCLUDED.derivation_key
                """, caseId, stage, stepKey, status, toJson(result), error, cacheHit, derivationKey);
    }

    public Optional<Map<String, Object>> stepResult(String caseId, String stage, String stepKey) {
        return jdbc.queryForList("""
                SELECT result::text FROM helix_check.lc_step
                 WHERE case_id = ?::uuid AND stage = ? AND step_key = ?
                """, String.class, caseId, stage, stepKey)
                .stream().findFirst().map(this::readMap);
    }

    /** Clears everything a rerun invalidates. Downstream only — the stage being rerun writes its own. */
    public void clearFrom(String caseId, StageId stage) {
        List<String> keys = stage.downstream().stream().map(StageId::key).toList();
        if (keys.isEmpty()) return;
        Object[] args = new Object[] { caseId, keys.toArray(String[]::new) };
        jdbc.update("DELETE FROM helix_check.lc_step WHERE case_id = ?::uuid AND stage = ANY(?)", args);
        if (stage.ordinal() < StageId.INTERPRET.ordinal()) {
            jdbc.update("DELETE FROM helix_check.lc_fact WHERE case_id = ?::uuid", caseId);
        }
        if (stage.ordinal() < StageId.PLAN.ordinal()) {
            jdbc.update("DELETE FROM helix_check.lc_plan_check WHERE case_id = ?::uuid AND NOT added_by_officer", caseId);
        }
        if (stage.ordinal() < StageId.EXECUTE.ordinal()) {
            jdbc.update("DELETE FROM helix_check.lc_finding WHERE case_id = ?::uuid AND NOT raised_by_officer", caseId);
        }
    }

    // --- Facts --------------------------------------------------------------

    public void upsertFact(String caseId, Map<String, Object> f) {
        jdbc.update("""
                INSERT INTO helix_check.lc_fact
                    (case_id, doc_code, label, field_key, value, value_norm, page, anchor_id,
                     source, source_text, confidence, flag, slot_votes)
                VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (case_id, doc_code, label) DO UPDATE SET
                    value = EXCLUDED.value, value_norm = EXCLUDED.value_norm,
                    page = EXCLUDED.page, anchor_id = EXCLUDED.anchor_id,
                    source = EXCLUDED.source, source_text = EXCLUDED.source_text,
                    confidence = EXCLUDED.confidence, flag = EXCLUDED.flag,
                    slot_votes = EXCLUDED.slot_votes
                """,
                caseId, f.get("docId"), f.get("label"), f.get("fieldKey"), str(f.get("value")),
                str(f.get("valueNorm")), f.get("page"), f.get("anchorId"), f.getOrDefault("source", ""),
                f.get("sourceText"), f.getOrDefault("confidence", "MED"), f.get("flag"),
                toJson(f.get("slotVotes")));
    }

    public List<Map<String, Object>> facts(String caseId) {
        return jdbc.queryForList("""
                SELECT doc_code, label, field_key, value, value_norm, page, anchor_id,
                       source, source_text, confidence, flag
                  FROM helix_check.lc_fact WHERE case_id = ?::uuid ORDER BY doc_code, label
                """, caseId);
    }

    // --- Plan ---------------------------------------------------------------

    public void upsertPlanCheck(String caseId, Map<String, Object> c) {
        jdbc.update("""
                INSERT INTO helix_check.lc_plan_check
                    (case_id, check_id, origin, tier, check_type, is_gate, cited_as, area_id,
                     name, applies_because, rule_ref, severity, refs, rule_def, execution_plan,
                     not_covered, planned_by_llm, added_by_officer, added_by, status, ordinal)
                VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (case_id, check_id) DO UPDATE SET
                    area_id = EXCLUDED.area_id, status = EXCLUDED.status,
                    rule_def = EXCLUDED.rule_def, execution_plan = EXCLUDED.execution_plan
                """,
                caseId, c.get("id"), c.getOrDefault("origin", "DICTIONARY"),
                c.getOrDefault("tier", "JUDGED"), c.get("checkType"),
                c.getOrDefault("gate", false), c.getOrDefault("citedAs", "practice"), c.get("areaId"),
                c.get("name"), c.get("appliesBecause"), c.get("ruleRef"),
                c.getOrDefault("severity", "MAJOR"), strArray((List<?>) c.get("refs")),
                toJson(c.get("ruleDef")), c.get("executionPlan"),
                c.getOrDefault("notCovered", false), c.getOrDefault("plannedByLlm", false),
                c.getOrDefault("addedByOfficer", false), c.get("addedBy"),
                c.getOrDefault("status", "PLANNED"), c.getOrDefault("ordinal", 0));
    }

    public List<Map<String, Object>> planChecks(String caseId) {
        return jdbc.queryForList(
                "SELECT * FROM helix_check.lc_plan_check WHERE case_id = ?::uuid ORDER BY ordinal, check_id", caseId);
    }

    public void setCheckStatus(String caseId, String checkId, String status) {
        jdbc.update("UPDATE helix_check.lc_plan_check SET status = ? WHERE case_id = ?::uuid AND check_id = ?",
                status, caseId, checkId);
    }

    // --- Findings -----------------------------------------------------------

    public void upsertFinding(String caseId, Map<String, Object> f) {
        jdbc.update("""
                INSERT INTO helix_check.lc_finding
                    (case_id, finding_ref, plan_check_id, severity, area, area_id, doc_code, page,
                     credit_anchor_id, title, statement, statement_source, detail, expected, quote,
                     quote_source, reason, analysis, comparison, failed_row, trace, confidence,
                     raised_by_officer, raised_by)
                VALUES (?::uuid, ?,
                        (SELECT id FROM helix_check.lc_plan_check WHERE case_id = ?::uuid AND check_id = ?),
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?, ?, ?)
                ON CONFLICT (case_id, finding_ref) DO UPDATE SET
                    severity = EXCLUDED.severity, title = EXCLUDED.title,
                    statement = EXCLUDED.statement, detail = EXCLUDED.detail,
                    expected = EXCLUDED.expected, quote = EXCLUDED.quote,
                    reason = EXCLUDED.reason, analysis = EXCLUDED.analysis,
                    comparison = EXCLUDED.comparison, trace = EXCLUDED.trace
                """,
                caseId, f.get("id"), caseId, f.get("checkId"),
                f.getOrDefault("severity", "possible"), f.get("area"), f.get("areaId"),
                f.get("docId"), f.get("page"), f.get("creditAnchorId"), f.get("title"),
                f.get("statement"), f.getOrDefault("statementSource", "derived"), f.get("detail"),
                f.get("expected"), f.get("quote"), f.get("quoteSource"), f.get("reason"),
                toJson(f.get("analysis")), toJson(f.get("comparison")), f.get("failedRow"),
                toJson(f.get("trace")), f.get("confidence"),
                f.getOrDefault("raisedByOfficer", false), f.get("raisedBy"));
    }

    public List<Map<String, Object>> findings(String caseId) {
        return jdbc.queryForList("""
                SELECT f.*, p.check_id, p.origin, p.tier, p.check_type, p.cited_as
                  FROM helix_check.lc_finding f
                  LEFT JOIN helix_check.lc_plan_check p ON p.id = f.plan_check_id
                 WHERE f.case_id = ?::uuid ORDER BY f.created_at
                """, caseId);
    }

    public void deleteFinding(String caseId, String findingRef) {
        jdbc.update("DELETE FROM helix_check.lc_finding WHERE case_id = ?::uuid AND finding_ref = ?",
                caseId, findingRef);
    }

    // --- Run steps ----------------------------------------------------------

    public void recordRunStep(String caseId, Map<String, Object> r) {
        jdbc.update("""
                INSERT INTO helix_check.lc_run_step
                    (case_id, step_id, stage, kind, name, role, model_id, checks_count,
                     total_calls, cached_calls, seconds, tokens_in, tokens_out, retries, note, ordinal)
                VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (case_id, step_id) DO UPDATE SET
                    total_calls = EXCLUDED.total_calls, cached_calls = EXCLUDED.cached_calls,
                    seconds = EXCLUDED.seconds, tokens_in = EXCLUDED.tokens_in,
                    tokens_out = EXCLUDED.tokens_out, checks_count = EXCLUDED.checks_count
                """,
                caseId, r.get("id"), r.get("stage"), r.get("kind"), r.get("name"), r.get("role"),
                r.get("model"), r.getOrDefault("checks", 0), r.getOrDefault("calls", 0),
                r.getOrDefault("cachedCalls", 0), r.getOrDefault("seconds", 0),
                r.getOrDefault("tokensIn", 0), r.getOrDefault("tokensOut", 0),
                r.getOrDefault("retries", 0), r.get("note"), r.getOrDefault("ordinal", 0));
    }

    public List<Map<String, Object>> runSteps(String caseId) {
        return jdbc.queryForList(
                "SELECT * FROM helix_check.lc_run_step WHERE case_id = ?::uuid ORDER BY ordinal, step_id", caseId);
    }

    // --- Officer actions ----------------------------------------------------

    public void recordAction(String caseId, String action, String target, Object payload,
                             String officerId, String note) {
        jdbc.update("""
                INSERT INTO helix_check.lc_officer_action (case_id, action, target, payload, officer_id, note)
                VALUES (?::uuid, ?, ?, ?::jsonb, ?, ?)
                """, caseId, action, target == null ? "-" : target, toJson(payload),
                officerId == null ? "officer" : officerId, note);
    }

    public List<Map<String, Object>> decisions(String caseId) {
        return jdbc.queryForList(
                "SELECT finding_ref, disposition, note FROM helix_check.v_finding_decision WHERE case_id = ?::uuid",
                caseId);
    }

    public Optional<Map<String, Object>> verdict(String caseId) {
        return jdbc.queryForList("SELECT * FROM helix_check.v_case_verdict WHERE case_id = ?::uuid", caseId)
                .stream().findFirst();
    }

    // --- Helpers ------------------------------------------------------------

    private String toJson(Object o) {
        if (o == null) return null;
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(String raw) {
        try {
            return json.readValue(raw, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer[] intArray(List<?> list) {
        if (list == null) return new Integer[0];
        return list.stream().map(v -> v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v)))
                .toArray(Integer[]::new);
    }

    private static String[] strArray(List<?> list) {
        if (list == null) return new String[0];
        return list.stream().map(String::valueOf).toArray(String[]::new);
    }
}
