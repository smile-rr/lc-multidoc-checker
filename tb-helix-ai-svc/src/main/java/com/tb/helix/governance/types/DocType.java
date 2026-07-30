package com.tb.helix.governance.types;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The presented document types this examination knows.
 *
 * <p>Shared vocabulary: Governance binds dictionary fields to these documents and marks
 * which are available before a presentation is read; lc-check classifies pages into them
 * and cites them on every fact and finding. One list, or the two modules drift.
 *
 * <p>Codes are part of the wire format — the UI addresses a document by its code — so they
 * are stable, not an internal detail to be renamed.
 *
 * <p>{@code CS} is the covering schedule — the presenting bank's letter, not a document the
 * credit calls for. It carries the presentation date, which is why it earns a place here
 * despite nobody examining it: a hard check on expiry cannot run without it.
 */
public final class DocType {

    private DocType() {
    }

    public record Def(String code, String label, String abbr, String icon) {
    }

    public static final Map<String, Def> ALL = new LinkedHashMap<>();

    private static void def(String code, String label, String abbr, String icon) {
        ALL.put(code, new Def(code, label, abbr, icon));
    }

    static {
        def("CS", "Covering schedule", "CS", "mail");
        def("INV", "Commercial invoice", "IN", "receipt");
        def("BOL", "Bill of lading", "BL", "ship");
        def("PKL", "Packing list", "PK", "package");
        def("BOE", "Bill of exchange", "BE", "banknote");
        def("BC", "Beneficiary certificate", "BC", "award");
        def("WC", "Warranty certificate", "WC", "shield-check");
        def("INS", "Insurance document", "IN", "umbrella");
        def("COO", "Certificate of origin", "CO", "globe");
        def("UNKNOWN", "Unidentified", "??", "file-question");
    }

    public static Def of(String code) {
        return ALL.getOrDefault(code == null ? "UNKNOWN" : code.toUpperCase(), ALL.get("UNKNOWN"));
    }

    /** The classifier's vocabulary, as a prompt fragment. */
    public static String vocabulary() {
        StringBuilder sb = new StringBuilder();
        ALL.forEach((code, d) -> {
            if (!code.equals("UNKNOWN")) sb.append("  ").append(code).append(" — ").append(d.label()).append('\n');
        });
        return sb.toString();
    }
}
