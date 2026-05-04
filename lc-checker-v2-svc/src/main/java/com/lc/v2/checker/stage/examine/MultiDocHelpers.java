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

    // ────────────────────────────────────────────────────────────────────
    // Cross-document helpers (referenced from catalog.yml SpEL expressions)
    //
    // All helpers are tolerant of envelope-wrapped values: a field value may
    // arrive as a raw scalar (String/Number) or as a Map{value, confidence,
    // source, …}. {@link #unwrap(Object)} normalises both shapes so SpEL
    // call-sites can pass `#docs['BOL']?.get('field')` without unwrapping.
    // ────────────────────────────────────────────────────────────────────

    /** Strip a numeric value out of "USD 12,345.67", "1.234,56", "approx 100", etc. */
    private static Double parseAmount(Object o) {
        Object u = unwrap(o);
        if (u == null) return null;
        String s = u.toString().replaceAll("[^0-9.,\\-]", "");
        if (s.isBlank()) return null;
        // If both '.' and ',' present, assume the rightmost is the decimal.
        int dot = s.lastIndexOf('.'), com = s.lastIndexOf(',');
        if (dot >= 0 && com >= 0) {
            if (com > dot) s = s.replace(".", "").replace(',', '.');
            else s = s.replace(",", "");
        } else if (com >= 0) {
            // Only commas — could be thousands or decimal. Heuristic: last group
            // of 3 digits → thousands; otherwise decimal.
            int idx = s.lastIndexOf(',');
            String tail = s.substring(idx + 1);
            if (tail.length() == 3 && tail.chars().allMatch(Character::isDigit))
                s = s.replace(",", "");
            else s = s.replace(',', '.');
        }
        try { return Double.parseDouble(s); } catch (NumberFormatException e) { return null; }
    }

    /**
     * AMT-02 — strict equality between two monetary amounts (UCP 18(b) / ISBP B3).
     * Envelope-aware; tolerates currency-prefixed strings and locale separators.
     */
    public static Map<String, Object> amountsEqual(Object boeAmount, Object invAmount) {
        Object boeU = unwrap(boeAmount), invU = unwrap(invAmount);
        if (boeU == null || invU == null) {
            return result("NOT_APPLICABLE",
                    "Required amounts not extracted (BOE=" + boeU + ", INV=" + invU + ")", 1.0);
        }
        Double b = parseAmount(boeU), i = parseAmount(invU);
        if (b == null || i == null) {
            return result("DOUBTS",
                    "Could not parse amounts: BOE='" + boeU + "', INV='" + invU + "'", 0.5);
        }
        // Penny tolerance (1 cent) — guards against rounding noise from extraction.
        if (Math.abs(b - i) < 0.01) {
            return result("PASS", "Draft amount " + b + " = invoice total " + i, 1.0);
        }
        return result("FAIL",
                "Draft amount " + b + " ≠ invoice total " + i + " (UCP 18(b) / ISBP B3)", 1.0);
    }

    /**
     * PARTY-01 / PARTY-03 — semantic equality between two named parties.
     * ISBP A14/A23: variations such as "Ltd.", "Co.", whitespace, case differences
     * are acceptable as long as they don't constitute a different legal entity.
     */
    public static Map<String, Object> namesEqual(Object docName, Object lcName) {
        Object dU = unwrap(docName), lU = unwrap(lcName);
        if (dU == null || lU == null) {
            return result("NOT_APPLICABLE",
                    "Names not both available (doc=" + dU + ", lc=" + lU + ")", 1.0);
        }
        String a = canonName(dU.toString()), b = canonName(lU.toString());
        if (a.equals(b) || a.contains(b) || b.contains(a)) {
            return result("PASS", "'" + dU + "' ≈ '" + lU + "' (ISBP A14/A23)", 1.0);
        }
        return result("FAIL", "'" + dU + "' ≠ '" + lU + "' (ISBP A23 — distinct legal entities)", 1.0);
    }

    private static String canonName(String s) {
        return s.toLowerCase()
                .replaceAll("[\\.,]", " ")
                .replaceAll("\\b(ltd|limited|co|company|corp|corporation|inc|incorporated|llc|plc|gmbh|sa|spa|pty)\\b", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /**
     * GOODS-02 — quantity / package count consistent between INV and PKL (ISBP M1).
     * Compares numeric `quantity`, `total_packages`, and `total_weight` if both sides
     * provide them. Any single mismatch fails; missing fields downgrade to N/A.
     */
    public static Map<String, Object> quantitiesConsistent(
            Map<String, Object> inv, Map<String, Object> pkl) {
        if (inv == null || pkl == null) {
            return result("NOT_APPLICABLE", "INV or PKL not presented", 1.0);
        }
        String[] keys = {"quantity", "total_packages", "total_weight"};
        StringJoiner notes = new StringJoiner("; ");
        boolean checked = false, failed = false;
        for (String k : keys) {
            Object iv = unwrap(inv.get(k)), pv = unwrap(pkl.get(k));
            if (iv == null || pv == null) continue;
            checked = true;
            Double in = parseAmount(iv), pn = parseAmount(pv);
            if (in != null && pn != null) {
                if (Math.abs(in - pn) < 0.001) notes.add(k + ": " + in + " ✓");
                else { failed = true; notes.add(k + ": INV=" + in + " ≠ PKL=" + pn); }
            } else if (iv.toString().equalsIgnoreCase(pv.toString())) {
                notes.add(k + ": '" + iv + "' ✓");
            } else {
                failed = true;
                notes.add(k + ": '" + iv + "' ≠ '" + pv + "'");
            }
        }
        if (!checked) return result("NOT_APPLICABLE", "No comparable quantity fields extracted", 1.0);
        return result(failed ? "FAIL" : "PASS", notes.toString(), 1.0);
    }

    /**
     * GOODS-03 — shipping marks consistent across PKL and BOL (ISBP M2).
     * Marks fields are free-form text — compare canonicalised whitespace + case.
     */
    public static Map<String, Object> marksConsistent(Object pklMarks, Object bolMarks) {
        Object p = unwrap(pklMarks), b = unwrap(bolMarks);
        if (p == null || b == null) {
            return result("NOT_APPLICABLE",
                    "Shipping marks not on both PKL and BOL", 1.0);
        }
        String pn = p.toString().toLowerCase().replaceAll("\\s+", " ").trim();
        String bn = b.toString().toLowerCase().replaceAll("\\s+", " ").trim();
        if (pn.equals(bn) || pn.contains(bn) || bn.contains(pn)) {
            return result("PASS", "Marks consistent across PKL and BOL", 1.0);
        }
        return result("FAIL",
                "Shipping marks differ: PKL='" + p + "', BOL='" + b + "' (ISBP M2)", 1.0);
    }

    /**
     * SHIP-01 — BOL bears on-board notation (UCP 20(a)(ii) / ISBP D20).
     * PASS if the consensus extraction marks the BOL as on-board, or if
     * `onboard_notation` carries a date / non-empty value.
     */
    public static Map<String, Object> onBoardNotationPresent(Map<String, Object> bol) {
        if (bol == null) return result("NOT_APPLICABLE", "BOL not presented", 1.0);
        Object notation = unwrap(bol.get("onboard_notation"));
        Object shipDate = unwrap(bol.get("shipment_date"));
        if (notation != null && !notation.toString().isBlank()) {
            return result("PASS", "On-board notation present: '" + notation + "'", 1.0);
        }
        if (shipDate != null && !shipDate.toString().isBlank()) {
            return result("PASS",
                    "Shipment date '" + shipDate + "' implies on-board (pre-printed shipped on board)", 1.0);
        }
        return result("FAIL",
                "No on-board notation or shipment date on BOL (UCP 20(a)(ii))", 1.0);
    }

    /**
     * SHIP-02 — BOL ports of loading/discharge match the LC fields (UCP 20(a)(iii)).
     * Each side checked independently. Missing LC fields → N/A for that side only.
     */
    public static Map<String, Object> portsMatch(
            Map<String, Object> bol, Object lcPol, Object lcPod) {
        if (bol == null) return result("NOT_APPLICABLE", "BOL not presented", 1.0);
        StringJoiner notes = new StringJoiner("; ");
        boolean checked = false, failed = false;
        Object[][] pairs = {
                {"port_of_loading",   unwrap(bol.get("port_of_loading")),   unwrap(lcPol)},
                {"port_of_discharge", unwrap(bol.get("port_of_discharge")), unwrap(lcPod)},
        };
        for (Object[] p : pairs) {
            Object docVal = p[1], lcVal = p[2];
            if (docVal == null || lcVal == null) continue;
            checked = true;
            String d = docVal.toString().toLowerCase().trim();
            String l = lcVal.toString().toLowerCase().trim();
            if (d.equals(l) || d.contains(l) || l.contains(d)) {
                notes.add(p[0] + ": '" + docVal + "' ✓");
            } else {
                failed = true;
                notes.add(p[0] + ": BOL='" + docVal + "' ≠ LC='" + lcVal + "'");
            }
        }
        if (!checked) return result("NOT_APPLICABLE", "No comparable port fields extracted", 1.0);
        return result(failed ? "FAIL" : "PASS", notes.toString(), 1.0);
    }

    /**
     * SHIP-03 — Invoice Incoterms ↔ BOL freight notation (ISBP C12).
     * CFR/CIF/CIP/CPT → expect freight prepaid; FOB/FCA/EXW/FAS → freight collect.
     */
    public static Map<String, Object> incotermsFreightConsistent(Object incoterms, Object freight) {
        Object i = unwrap(incoterms), f = unwrap(freight);
        if (i == null || f == null) {
            return result("NOT_APPLICABLE",
                    "Incoterms or freight notation missing (incoterms=" + i + ", freight=" + f + ")", 1.0);
        }
        String inc = i.toString().toUpperCase();
        String fr = f.toString().toLowerCase();
        boolean prepaidExpected = inc.contains("CFR") || inc.contains("CIF")
                || inc.contains("CIP") || inc.contains("CPT") || inc.contains("DDP");
        boolean collectExpected = inc.contains("FOB") || inc.contains("FCA")
                || inc.contains("EXW") || inc.contains("FAS");
        boolean isPrepaid = fr.contains("prepaid") || fr.contains("paid");
        boolean isCollect = fr.contains("collect");
        if (prepaidExpected && isPrepaid) return result("PASS", "Incoterm " + inc + " ↔ freight prepaid ✓", 1.0);
        if (collectExpected && isCollect) return result("PASS", "Incoterm " + inc + " ↔ freight collect ✓", 1.0);
        if (prepaidExpected && isCollect)
            return result("FAIL", "Incoterm " + inc + " expects PREPAID; BOL shows '" + f + "' (ISBP C12)", 1.0);
        if (collectExpected && isPrepaid)
            return result("FAIL", "Incoterm " + inc + " expects COLLECT; BOL shows '" + f + "' (ISBP C12)", 1.0);
        return result("DOUBTS",
                "Could not classify incoterm/freight pair: '" + inc + "' / '" + f + "'", 0.5);
    }

    /**
     * DOC-01 — Full set of B/L originals presented (UCP 17 / 20(a)(iv) / ISBP D7).
     * Compares `originals_presented` against `originals_required` extracted from the
     * BOL itself ("issued in 3 originals", "full set of 3" etc.).
     */
    public static Map<String, Object> fullSetPresented(Map<String, Object> bol) {
        if (bol == null) return result("NOT_APPLICABLE", "BOL not presented", 1.0);
        Object req = unwrap(bol.get("originals_required"));
        Object pres = unwrap(bol.get("originals_presented"));
        Integer reqN = parseInt(req), presN = parseInt(pres);
        if (reqN == null) return result("NOT_APPLICABLE",
                "BOL does not state number of originals issued — assume single original (UCP 17)", 1.0);
        if (presN == null) return result("DOUBTS",
                "BOL declares " + reqN + " originals but presented count not captured", 0.5);
        if (presN >= reqN) return result("PASS",
                "Full set presented: " + presN + " of " + reqN + " originals", 1.0);
        return result("FAIL",
                "Only " + presN + " of " + reqN + " originals presented (UCP 20(a)(iv))", 1.0);
    }

    /**
     * DOC-03 — Beneficiary cert signed when LC requires signature (ISBP Q3).
     * If LC :46A: / :47A: don't require a BC signature → N/A.
     * If required and BC carries a signature → PASS.
     */
    public static Map<String, Object> bcSignaturePresentIfRequired(
            Map<String, Object> bc, Map<String, Object> lc) {
        if (bc == null) return result("NOT_APPLICABLE", "Beneficiary certificate not presented", 1.0);
        boolean required = lcRequiresBcSignature(lc);
        Object sigPresent = unwrap(bc.get("bc_signature_present"));
        boolean hasSignature = isTruthy(sigPresent);
        if (!required) return result("NOT_APPLICABLE",
                "LC does not explicitly require a signed beneficiary certificate", 1.0);
        if (hasSignature) return result("PASS",
                "Beneficiary certificate is signed as required (ISBP Q3 / UCP 3)", 1.0);
        return result("FAIL",
                "LC requires signed beneficiary certificate but no signature detected (ISBP Q3)", 1.0);
    }

    private static boolean lcRequiresBcSignature(Map<String, Object> lc) {
        if (lc == null) return false;
        for (String k : List.of("documents_required", "additional_conditions", "field_46a", "field_47a")) {
            Object v = unwrap(lc.get(k));
            if (v == null) continue;
            String s = v.toString().toLowerCase();
            // Match "signed beneficiary certificate", "beneficiary's signed certificate", etc.
            if (s.contains("signed") && s.contains("beneficiary") && s.contains("certif")) return true;
            if (s.contains("beneficiary") && s.contains("certif") && s.contains("signature")) return true;
        }
        return false;
    }

    private static boolean isTruthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        String s = v.toString().trim().toLowerCase();
        if (s.isEmpty()) return false;
        return !(s.equals("false") || s.equals("no") || s.equals("0") || s.equals("none") || s.equals("absent"));
    }

    private static Integer parseInt(Object v) {
        Object u = unwrap(v);
        if (u == null) return null;
        if (u instanceof Number n) return n.intValue();
        String s = u.toString().replaceAll("[^0-9]", "");
        if (s.isBlank()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }

    /**
     * Field-pool values arrive either as raw scalars or as envelope maps
     * {value, confidence, source, …}. Unwrap to the inner value before comparing.
     */
    @SuppressWarnings("unchecked")
    private static Object unwrap(Object v) {
        if (v == null) return null;
        if (v instanceof Map<?, ?> m) {
            Object inner = ((Map<String, Object>) m).get("value");
            return inner == null ? null : (inner.toString().isBlank() ? null : inner);
        }
        if (v.toString().isBlank()) return null;
        return v;
    }

    private static Object firstNonBlank(Map<String, Object> map, String... keys) {
        if (map == null) return null;
        for (String k : keys) {
            Object v = unwrap(map.get(k));
            if (v != null) return v;
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
