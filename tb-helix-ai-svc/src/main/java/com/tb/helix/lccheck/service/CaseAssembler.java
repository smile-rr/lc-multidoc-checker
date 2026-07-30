package com.tb.helix.lccheck.service;

import com.tb.helix.lccheck.domain.*;
import com.tb.helix.lccheck.domain.document.*;
import com.tb.helix.lccheck.domain.examination.*;
import com.tb.helix.lccheck.persistence.CaseStore;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Database rows to the shapes the workbench reads.
 *
 * <p>Its own class because it is the one place the two vocabularies meet, and they are
 * deliberately different: the schema says {@code doc_code} and {@code is_gate}, the wire
 * says {@code docId} and {@code gate}. The browser should not learn our column names — a
 * rename in the schema would otherwise be a breaking API change.
 *
 * <p>Kept out of the controller, which should decide status codes and nothing else, and out
 * of the store, which should not know a browser exists.
 */
@Component
public class CaseAssembler {

    public CaseSummary summary(Map<String, Object> r) {
        return new CaseSummary(
                str(r.get("case_ref")),
                nz(r.get("credit_ref")),
                nz(r.get("beneficiary")),
                nz(r.get("currency")),
                num(r.get("amount")),
                asInt(r.get("page_count")),
                str(r.get("status")),
                statusLabel(str(r.get("status"))),
                asInt(r.get("reply_due_days")),
                true);
    }

    public CreditTerms credit(Map<String, Object> r) {
        return new CreditTerms(
                nz(r.get("credit_ref")), date(r.get("issued_date")),
                nz(r.get("applicant")), nz(r.get("beneficiary")),
                nz(r.get("currency")), num(r.get("amount")), num(r.get("tolerance_pct")),
                date(r.get("latest_shipment")), date(r.get("expiry")), nz(r.get("expiry_place")),
                // 21 days is UCP 600 art. 14(c)'s default when the credit is silent.
                r.get("presentation_days") == null ? 21 : asInt(r.get("presentation_days")),
                nz(r.get("tenor")), nz(r.get("goods")));
    }

    public LcDocument document(Map<String, Object> d, List<?> creditLines) {
        List<Integer> pages = pagesOf(d);
        boolean isCredit = "credit".equals(d.get("role"));
        return new LcDocument(
                str(d.get("doc_code")), str(d.get("role")), nz(d.get("doc_type_label")),
                nz(d.get("abbr")), nz(d.get("file_name")), nz(d.get("reference")), nz(d.get("icon")),
                pages.isEmpty() ? null : List.of(pages.get(0), pages.get(pages.size() - 1)),
                pages, nz(d.get("extraction_mode")),
                Boolean.TRUE.equals(d.get("low_confidence")), str(d.get("scan_note")),
                nz(d.get("doc_type_label")),
                pages.isEmpty() ? "" : "bundle pages " + pages.get(0) + "–" + pages.get(pages.size() - 1),
                isCredit ? creditLines : List.of(),
                List.of());
    }

    public FactView fact(Map<String, Object> f) {
        return new FactView(
                str(f.get("doc_code")), str(f.get("anchor_id")), asInt(f.get("page")),
                str(f.get("label")), nz(f.get("value")), nz(f.get("source")),
                str(f.get("source_text")), nz(f.get("confidence")), str(f.get("flag")));
    }

    public PlanCheckView planCheck(Map<String, Object> c) {
        return new PlanCheckView(
                str(c.get("check_id")), nz(c.get("name")), str(c.get("area_id")),
                nz(c.get("applies_because")), nz(c.get("rule_ref")),
                Boolean.TRUE.equals(c.get("added_by_officer")),
                Boolean.TRUE.equals(c.get("planned_by_llm")),
                Boolean.TRUE.equals(c.get("not_covered")),
                lower(c.get("tier")),
                "CREDIT".equals(c.get("origin")) ? "credit" : "dictionary",
                Boolean.TRUE.equals(c.get("is_gate")),
                nz(c.get("cited_as")), str(c.get("check_type")), str(c.get("execution_plan")),
                Map.of("severity", nz(c.get("severity")), "rule", nz(c.get("name"))));
    }

    @SuppressWarnings("unchecked")
    public FindingView finding(Map<String, Object> f) {
        Object analysis = f.get("analysis");
        return new FindingView(
                str(f.get("finding_ref")), str(f.get("severity")), nz(f.get("area")),
                str(f.get("area_id")), str(f.get("check_id")), nz(f.get("doc_code")),
                asInt(f.get("page")), str(f.get("anchor_id")), nz(f.get("credit_anchor_id")),
                nz(f.get("title")), nz(f.get("statement")), nz(f.get("statement_source")),
                nz(f.get("detail")), nz(f.get("expected")), nz(f.get("quote")),
                nz(f.get("quote_source")), nz(f.get("reason")),
                Boolean.TRUE.equals(f.get("raised_by_officer")),
                // Read through the plan check, never stored twice — a finding that carried
                // its own copy would drift from the check that produced it.
                f.get("tier") == null ? null : lower(f.get("tier")),
                "CREDIT".equals(f.get("origin")) ? "credit" : "dictionary",
                str(f.get("check_type")), str(f.get("cited_as")),
                analysis instanceof Map ? (Map<String, Object>) analysis : Map.of(),
                List.of());
    }

    public RunState runState(Map<String, Object> row, int segmented) {
        String stage = str(row.get("stage"));
        boolean started = !"intake".equals(stage);
        boolean finished = List.of("execute", "signoff").contains(stage);
        return new RunState(started, finished, segmented,
                finished ? Areas.ALL.stream().map(CheckArea::id).toList() : List.of());
    }

    public Map<String, Object> bundlePage(Map<String, Object> p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("number", p.get("page_no"));
        m.put("docId", nz(p.get("doc_code")));
        m.put("label", nz(p.get("label")));
        return m;
    }

    /** The credit's own reference and expiry, for the dialog shown before a case exists. */
    public List<Map<String, String>> peek(Map<String, Object> c) {
        List<Map<String, String>> out = new ArrayList<>();
        out.add(Map.of("label", "Credit", "value",
                nz(c.get("creditRef")) + (c.get("expiry") == null ? "" : " · expires " + c.get("expiry"))));
        out.add(Map.of("label", "Amount", "value", nz(c.get("currency")) + " " + nz(c.get("amount"))));
        out.add(Map.of("label", "Beneficiary", "value", nz(c.get("beneficiary"))));
        out.add(Map.of("label", "Applicant", "value", nz(c.get("applicant"))));
        return out;
    }

    /**
     * Days until the refusal notice is due.
     *
     * <p>Computed, never stored. Under UCP 600 art. 16(d) a bank has five banking days;
     * a countdown written to a column is wrong by the next morning.
     */
    public Integer daysUntil(Object date) {
        LocalDate d = asDate(date);
        return d == null ? null : (int) Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), d));
    }

    @SuppressWarnings("unchecked")
    public List<Integer> pagesOf(Map<String, Object> d) {
        Object pages = d.get("pages");
        if (pages instanceof java.sql.Array a) {
            try {
                return List.of((Integer[]) a.getArray());
            } catch (Exception e) {
                return List.of();
            }
        }
        return pages instanceof List<?> l ? (List<Integer>) l : List.of();
    }

    public List<?> creditLines(CaseStore store, String caseId) {
        return store.stepResult(caseId, "intake", "swift")
                .map(r -> (List<?>) r.getOrDefault("lines", List.of()))
                .orElse(List.of());
    }

    // --- Conversions --------------------------------------------------------

    private static String statusLabel(String status) {
        return switch (status == null ? "" : status) {
            case "awaiting_check" -> "Awaiting check";
            case "running" -> "Running";
            case "discrepancies" -> "Discrepancies";
            case "to_decide" -> "To decide";
            case "clean" -> "Clean";
            case "with_authoriser" -> "With authoriser";
            default -> status;
        };
    }

    private static LocalDate asDate(Object value) {
        if (value == null) return null;
        if (value instanceof java.sql.Date d) return d.toLocalDate();
        try {
            return LocalDate.parse(String.valueOf(value).substring(0, 10));
        } catch (Exception e) {
            return null;
        }
    }

    private static String date(Object value) {
        LocalDate d = asDate(value);
        return d == null ? null : d.toString();
    }

    private static Number num(Object o) {
        return o instanceof Number n ? n : 0;
    }

    private static Integer asInt(Object o) {
        return o instanceof Number n ? n.intValue() : null;
    }

    private static String lower(Object o) {
        return o == null ? null : String.valueOf(o).toLowerCase();
    }

    // Empty string where the UI renders the value directly and a null would print
    // "null"; str() where it branches on absence and null is the honest answer.
    private static String nz(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
