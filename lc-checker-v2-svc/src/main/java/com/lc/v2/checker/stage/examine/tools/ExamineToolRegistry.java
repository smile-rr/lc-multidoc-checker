package com.lc.v2.checker.stage.examine.tools;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.infra.persistence.SessionStore;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * Read-only deterministic tool registry exposed to AGENT_TOOL and AGENTIC rules.
 *
 * Spring AI 1.1's {@link Tool}-annotated methods are surfaced to the LLM via
 * {@code ChatClient.defaultTools(toolRegistry)}; tool descriptions guide the
 * model toward the right call site, so the wording matters.
 */
@Component
public class ExamineToolRegistry {

    private static final Logger log = LoggerFactory.getLogger(ExamineToolRegistry.class);

    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;

    /** Per-call tool-invocation timeline. AgentRuleExecutor primes this thread-local
     *  with a fresh list before invoking the ChatClient and reads it after. */
    private static final ThreadLocal<List<Map<String, Object>>> CAPTURE = new ThreadLocal<>();

    public ExamineToolRegistry(SessionStore sessionStore, ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
    }

    /** Begin capturing tool calls on the current thread. Returns the underlying list. */
    public List<Map<String, Object>> beginCapture() {
        List<Map<String, Object>> list = new ArrayList<>();
        CAPTURE.set(list);
        return list;
    }

    /** Stop capturing and clear the thread-local. */
    public void endCapture() {
        CAPTURE.remove();
    }

    private void record(String tool, Map<String, Object> args, Object result) {
        List<Map<String, Object>> list = CAPTURE.get();
        if (list == null) return;
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("tool", tool);
        entry.put("args", args);
        entry.put("result", result);
        list.add(entry);
    }

    @Tool(description = """
            Get a single LC field value by canonical field key (e.g. credit_amount,
            credit_currency, beneficiary_name, port_of_loading, expiry_date,
            latest_shipment_date, presentation_days, goods_description).
            Returns the field value as a string, or "(absent)" if the LC has no such field.""")
    public String getLcField(
            @ToolParam(description = "Session UUID") String sessionId,
            @ToolParam(description = "Canonical LC field key") String fieldKey) {
        String result;
        Map<String, Object> view = sessionStore.getLcParse(sessionId);
        if (view == null) {
            result = "(absent)";
        } else {
            Object fieldsJson = view.get("fields");
            if (!(fieldsJson instanceof String s) || s.isBlank()) {
                result = "(absent)";
            } else {
                try {
                    Map<String, Object> fields = objectMapper.readValue(s, new TypeReference<>() {});
                    Object v = fields.get(fieldKey);
                    result = v == null ? "(absent)" : String.valueOf(v);
                } catch (Exception e) {
                    log.warn("getLcField parse failed: {}", e.getMessage());
                    result = "(absent)";
                }
            }
        }
        record("getLcField", Map.of("sessionId", sessionId, "fieldKey", fieldKey), result);
        return result;
    }

    @Tool(description = """
            Get a single field value from a presented document by canonical field key.
            docType is one of INV, BOL, PKL, BOE, BC, WC, INS. fieldKey examples:
            invoice_total, draft_amount, bl_date, shipment_date, port_of_loading,
            shipping_marks, clean_indicator, beneficiary_name.
            Returns the field value as a string, or "(absent)" if the document or field is missing.""")
    public String getDocField(
            @ToolParam(description = "Session UUID") String sessionId,
            @ToolParam(description = "Document type code: INV, BOL, PKL, BOE, BC, WC, INS") String docType,
            @ToolParam(description = "Canonical field key") String fieldKey) {
        String result;
        String docId = findDocId(sessionId, docType);
        if (docId == null) {
            result = "(absent)";
        } else {
            Map<String, Object> consensus = sessionStore.getDocConsensus(docId);
            if (consensus == null) {
                result = "(absent)";
            } else {
                Object fieldsJson = consensus.get("fields");
                if (!(fieldsJson instanceof String s) || s.isBlank()) {
                    result = "(absent)";
                } else {
                    try {
                        Map<String, Object> fields = objectMapper.readValue(s, new TypeReference<>() {});
                        Object v = fields.get(fieldKey);
                        result = v == null ? "(absent)" : String.valueOf(v);
                    } catch (Exception e) {
                        log.warn("getDocField parse failed: {}", e.getMessage());
                        result = "(absent)";
                    }
                }
            }
        }
        record("getDocField",
                Map.of("sessionId", sessionId, "docType", docType, "fieldKey", fieldKey),
                result);
        return result;
    }

    @Tool(description = """
            Get a summary of every presented document in the session: doc type,
            original filename, parse status, and page count. Use this to discover
            which docs are available before querying their fields.""")
    public Map<String, Object> getDocInventory(
            @ToolParam(description = "Session UUID") String sessionId) {
        List<Map<String, Object>> docs = sessionStore.getDocuments(sessionId);
        List<Map<String, Object>> summary = new ArrayList<>(docs.size());
        for (Map<String, Object> d : docs) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("doc_type", d.get("doc_type"));
            row.put("original_filename", d.get("original_filename"));
            row.put("parse_status", d.get("parse_status"));
            row.put("page_count", d.get("page_count"));
            summary.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", summary.size());
        out.put("documents", summary);
        record("getDocInventory", Map.of("sessionId", sessionId), out);
        return out;
    }

    @Tool(description = """
            Calculate the inclusive number of days between two ISO-8601 dates
            (yyyy-MM-dd). Returns a positive integer if 'to' is after 'from',
            zero if equal, negative if 'to' is before 'from'. Returns -1 if
            either input is unparseable.""")
    public int calculateDateDiff(
            @ToolParam(description = "Earlier date in yyyy-MM-dd format") String fromIso,
            @ToolParam(description = "Later date in yyyy-MM-dd format") String toIso) {
        int result;
        try {
            LocalDate from = LocalDate.parse(fromIso);
            LocalDate to = LocalDate.parse(toIso);
            result = (int) ChronoUnit.DAYS.between(from, to);
        } catch (DateTimeParseException e) {
            log.debug("calculateDateDiff unparseable: from={} to={}", fromIso, toIso);
            result = -1;
        }
        record("calculateDateDiff", Map.of("fromIso", fromIso, "toIso", toIso), result);
        return result;
    }

    @Tool(description = """
            List the doc-type codes (e.g. INV, BOL, PKL) of every document
            presented in the session. Useful for confirming which docs are part
            of the presentation before reasoning about cross-document rules.""")
    public List<String> listPresentedDocs(
            @ToolParam(description = "Session UUID") String sessionId) {
        List<Map<String, Object>> docs = sessionStore.getDocuments(sessionId);
        List<String> types = new ArrayList<>(docs.size());
        for (Map<String, Object> d : docs) {
            Object t = d.get("doc_type");
            if (t != null) types.add(String.valueOf(t));
        }
        record("listPresentedDocs", Map.of("sessionId", sessionId), types);
        return types;
    }

    @Tool(description = """
            Verify that quantity × unit_price equals total_amount within a small
            rounding tolerance (default epsilon 0.01). Returns {match, computed,
            diff}. Use for AMT-03 invoice header arithmetic under UCP 600 Art.
            18(b). Pass header values you actually read from the invoice; if any
            input is null, the tool returns match=false with an error message —
            in that case the rule should return DOUBTS, not FAIL.""")
    public Map<String, Object> verifyArithmetic(
            @ToolParam(description = "Quantity from the invoice (decimal)") BigDecimal quantity,
            @ToolParam(description = "Unit price from the invoice (decimal, in invoice currency)") BigDecimal unitPrice,
            @ToolParam(description = "Total amount from the invoice (decimal, in invoice currency)") BigDecimal totalAmount,
            @ToolParam(description = "Rounding tolerance (e.g. 0.01); omit for default", required = false)
            BigDecimal epsilon) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (quantity == null || unitPrice == null || totalAmount == null) {
            out.put("match", false);
            out.put("computed", null);
            out.put("diff", null);
            out.put("error", "missing input: one of quantity / unit_price / total_amount is null");
            record("verifyArithmetic",
                    Map.of("quantity", String.valueOf(quantity),
                            "unit_price", String.valueOf(unitPrice),
                            "total_amount", String.valueOf(totalAmount)),
                    out);
            return out;
        }
        BigDecimal eps = epsilon == null ? new BigDecimal("0.01") : epsilon.abs();
        BigDecimal computed = quantity.multiply(unitPrice)
                .setScale(8, RoundingMode.HALF_UP).stripTrailingZeros();
        BigDecimal diff = computed.subtract(totalAmount).abs();
        boolean match = diff.compareTo(eps) <= 0;
        out.put("match", match);
        out.put("computed", computed.toPlainString());
        out.put("diff", diff.toPlainString());
        out.put("epsilon", eps.toPlainString());
        record("verifyArithmetic",
                Map.of("quantity", quantity.toPlainString(),
                        "unit_price", unitPrice.toPlainString(),
                        "total_amount", totalAmount.toPlainString(),
                        "epsilon", eps.toPlainString()),
                out);
        return out;
    }

    private String findDocId(String sessionId, String docType) {
        List<Map<String, Object>> docs = sessionStore.getDocuments(sessionId);
        for (Map<String, Object> d : docs) {
            if (docType.equalsIgnoreCase(String.valueOf(d.get("doc_type")))) {
                Object id = d.get("id");
                return id == null ? null : String.valueOf(id);
            }
        }
        return null;
    }
}
