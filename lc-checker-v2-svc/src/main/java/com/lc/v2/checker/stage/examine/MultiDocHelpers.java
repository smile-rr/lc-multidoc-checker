package com.lc.v2.checker.stage.examine;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Static helpers callable from SpEL expressions for multi-doc programmatic checks.
 *
 * SpEL invocation pattern:
 *   T(com.lc.v2.checker.stage.examine.MultiDocHelpers).currencyConsistent(#docs, #lc['credit_currency'])
 *
 * Each helper returns a structured result Map that {@link SpelEvaluator} converts to a
 * {@link com.lc.v2.checker.domain.result.CheckResult}:
 *   <ul>
 *     <li>{@code verdict}: {@code "PASS" | "FAIL" | "NOT_APPLICABLE"}</li>
 *     <li>{@code explanation}: human-readable per-doc breakdown</li>
 *     <li>{@code confidence}: 1.0 for deterministic comparisons</li>
 *   </ul>
 *
 * The {@code #docs} variable is {@code Map<String, Map<String, Object>>} keyed by
 * {@code DocType.name()} ("INV", "BOL", "BOE", "PKL", "BC", "WC", "INS").
 */
public final class MultiDocHelpers {

    private MultiDocHelpers() {}

    /** Doc types that carry a presented currency value worth checking against the LC. */
    private static final List<String> CURRENCY_DOC_TYPES = List.of("INV", "BOE", "INS");

    /** Doc types whose date should be compared to the presentation date (UCP 14(i)). */
    private static final List<String> DATED_DOC_TYPES = List.of("INV", "BOL", "PKL", "BOE", "BC", "WC", "INS");

    /** Per-doc canonical date field key fallback chain (most-specific → generic). */
    private static final Map<String, List<String>> DATE_FIELD_FALLBACKS = Map.of(
            "INV", List.of("invoice_date", "document_date"),
            "BOL", List.of("bl_date", "shipment_date", "document_date"),
            "PKL", List.of("pkl_date", "document_date"),
            "BOE", List.of("boe_date", "draft_date", "document_date"),
            "BC",  List.of("bc_date", "document_date"),
            "WC",  List.of("wc_date", "document_date"),
            "INS", List.of("insurance_date", "document_date")
    );

    /**
     * OP01 — every presented currency-bearing doc has currency = LC currency
     * (case-insensitive trim). Returns NOT_APPLICABLE if LC currency missing or
     * if no currency-bearing doc is present.
     */
    public static Map<String, Object> currencyConsistent(
            Map<String, Map<String, Object>> docs, Object lcCurrencyObj) {
        if (lcCurrencyObj == null || lcCurrencyObj.toString().isBlank()) {
            return result("NOT_APPLICABLE", "LC credit_currency not present", 1.0);
        }
        if (docs == null || docs.isEmpty()) {
            return result("NOT_APPLICABLE", "No documents to compare", 1.0);
        }
        String lcCurrency = lcCurrencyObj.toString().trim();

        boolean anyChecked = false;
        boolean failed = false;
        StringJoiner notes = new StringJoiner("; ");
        for (String docType : CURRENCY_DOC_TYPES) {
            Map<String, Object> doc = docs.get(docType);
            if (doc == null) continue;
            // Pick the first available currency-shaped field
            Object cur = firstNonBlank(doc, "credit_currency", "draft_currency", "currency");
            if (cur == null) {
                notes.add(docType + ": no currency field extracted");
                continue;
            }
            anyChecked = true;
            String docCur = cur.toString().trim();
            if (docCur.equalsIgnoreCase(lcCurrency)) {
                notes.add(docType + ": " + docCur + " = LC " + lcCurrency);
            } else {
                failed = true;
                notes.add(docType + ": " + docCur + " ≠ LC " + lcCurrency + " (UCP 18(a)(iii)/28(f)(i))");
            }
        }
        if (!anyChecked) {
            return result("NOT_APPLICABLE", "No currency-bearing documents presented (" + notes + ")", 1.0);
        }
        return result(failed ? "FAIL" : "PASS", notes.toString(), 1.0);
    }

    /**
     * OP03 — every presented doc's date ≤ presentation date (UCP 14(i)).
     * Walks each doc's per-type date fallback chain; missing dates → skipped with note.
     */
    public static Map<String, Object> docDatesValid(
            Map<String, Map<String, Object>> docs, LocalDate presentationDate) {
        if (presentationDate == null) {
            return result("NOT_APPLICABLE", "Presentation date not available", 1.0);
        }
        if (docs == null || docs.isEmpty()) {
            return result("NOT_APPLICABLE", "No documents to compare", 1.0);
        }
        boolean anyChecked = false;
        boolean failed = false;
        StringJoiner notes = new StringJoiner("; ");
        for (String docType : DATED_DOC_TYPES) {
            Map<String, Object> doc = docs.get(docType);
            if (doc == null) continue;
            List<String> chain = DATE_FIELD_FALLBACKS.getOrDefault(docType, List.of("document_date"));
            Object dateObj = firstNonBlank(doc, chain.toArray(new String[0]));
            if (dateObj == null) {
                notes.add(docType + ": no date field extracted");
                continue;
            }
            String dateStr = dateObj.toString().trim();
            try {
                LocalDate d = LocalDate.parse(dateStr);
                anyChecked = true;
                if (d.isAfter(presentationDate)) {
                    failed = true;
                    notes.add(docType + ": " + d + " > presentation " + presentationDate + " (UCP 14(i))");
                } else {
                    notes.add(docType + ": " + d + " ≤ presentation " + presentationDate);
                }
            } catch (DateTimeParseException e) {
                notes.add(docType + ": unparseable date '" + dateStr + "'");
            }
        }
        if (!anyChecked) {
            return result("NOT_APPLICABLE", "No parseable document dates (" + notes + ")", 1.0);
        }
        return result(failed ? "FAIL" : "PASS", notes.toString(), 1.0);
    }

    private static Object firstNonBlank(Map<String, Object> map, String... keys) {
        if (map == null) return null;
        for (String k : keys) {
            Object v = map.get(k);
            if (v != null && !v.toString().isBlank()) return v;
        }
        return null;
    }

    private static Map<String, Object> result(String verdict, String explanation, double confidence) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("verdict", verdict);
        m.put("explanation", explanation);
        m.put("confidence", confidence);
        return m;
    }
}
