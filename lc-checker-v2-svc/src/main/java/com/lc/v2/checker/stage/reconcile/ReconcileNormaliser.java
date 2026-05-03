package com.lc.v2.checker.stage.reconcile;

import com.lc.v2.checker.domain.common.FieldType;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Mechanical normalisation for cross-doc value comparison.
 *
 * <p>NO LLM. NO semantic equivalence. This is the plumbing layer that strips
 * cosmetic differences (whitespace, case, currency-symbol vs code, date
 * format, unit synonyms) so the matrix UI shows DISCREPANCY only when values
 * differ in substance — not in formatting.</p>
 *
 * <p>Anything beyond this — "goods description corresponds to :45A:", typos,
 * abbreviations not in the synonym table — is a UCP/ISBP rule judgement and
 * belongs in ExamineStage as an AGENT rule, not here.</p>
 */
@Component
public class ReconcileNormaliser {

    /** Currency symbol → ISO 4217 code. Extend as needed. */
    private static final Map<String, String> CURRENCY_SYMBOLS = Map.of(
            "$", "USD",
            "US$", "USD",
            "€", "EUR",
            "£", "GBP",
            "¥", "JPY",
            "₹", "INR",
            "S$", "SGD",
            "HK$", "HKD"
    );

    /** Unit synonym groups — values within the same group are equivalent. */
    private static final List<List<String>> UNIT_GROUPS = List.of(
            List.of("pcs", "pc", "piece", "pieces", "unit", "units", "ea", "each"),
            List.of("kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"),
            List.of("g", "gr", "gram", "grams"),
            List.of("mt", "ton", "tons", "tonne", "tonnes", "metric ton", "metric tons"),
            List.of("lb", "lbs", "pound", "pounds"),
            List.of("ctn", "ctns", "carton", "cartons"),
            List.of("box", "boxes"),
            List.of("pkg", "pkgs", "package", "packages"),
            List.of("set", "sets"),
            List.of("pair", "pairs", "pr", "prs"),
            List.of("dozen", "dz", "doz")
    );

    private static final DateTimeFormatter[] DATE_FORMATS = {
            DateTimeFormatter.ISO_LOCAL_DATE,                       // 2025-04-15
            DateTimeFormatter.ofPattern("d/M/yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("d-M-yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("dd-MM-yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("d-MMM-yyyy", Locale.ROOT),  // 15-Apr-2025
            DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ROOT),
            DateTimeFormatter.ofPattern("yyyyMMdd", Locale.ROOT)     // SWIFT compact 250415
    };

    /**
     * Returns true iff two raw values represent the same thing under the field's type.
     * Considers tolerance for AMOUNT (±10% per UCP 30(b)) and string normalisation
     * (whitespace/case/symbols/unit synonyms) for STRING/PARTY/COUNTRY/etc.
     */
    public CompareResult compare(FieldType type, Object lcValue, Object docValue) {
        if (lcValue == null && docValue == null) return new CompareResult(Verdict.MATCH, null, null);
        if (lcValue == null || docValue == null) return new CompareResult(Verdict.MISSING, null, null);

        if (type == FieldType.AMOUNT) return compareAmount(lcValue, docValue);
        if (type == FieldType.DATE)   return compareDate(lcValue, docValue);

        String a = normaliseText(lcValue);
        String b = normaliseText(docValue);
        if (a.equals(b)) return new CompareResult(Verdict.MATCH, a, null);

        // Currency-code compare (independent of formatting)
        String ca = normaliseCurrency(lcValue);
        String cb = normaliseCurrency(docValue);
        if (ca != null && cb != null && ca.equals(cb)) return new CompareResult(Verdict.MATCH, ca, null);

        // Unit synonym compare
        String ua = unitGroupOf(a);
        String ub = unitGroupOf(b);
        if (ua != null && ua.equals(ub)) return new CompareResult(Verdict.MATCH, ua, null);

        return new CompareResult(Verdict.DISCREPANCY, b, "differs from LC");
    }

    /** UCP 30(b) ±10% tolerance. */
    private CompareResult compareAmount(Object lcVal, Object docVal) {
        BigDecimal a = parseDecimal(lcVal);
        BigDecimal b = parseDecimal(docVal);
        if (a == null || b == null) {
            return new CompareResult(
                    normaliseText(lcVal).equals(normaliseText(docVal)) ? Verdict.MATCH : Verdict.DISCREPANCY,
                    docVal == null ? null : docVal.toString(), null);
        }
        if (a.compareTo(b) == 0) return new CompareResult(Verdict.MATCH, b.toPlainString(), null);
        BigDecimal diff = a.subtract(b).abs();
        BigDecimal threshold = a.abs().multiply(new BigDecimal("0.10"));
        BigDecimal pct = a.signum() == 0 ? BigDecimal.ZERO
                : diff.multiply(new BigDecimal(100))
                      .divide(a.abs(), 4, java.math.RoundingMode.HALF_UP);
        String detail = String.format("%s vs LC (%s%%)",
                docVal, b.compareTo(a) > 0 ? "+" + pct.toPlainString() : "-" + pct.toPlainString());
        if (diff.compareTo(threshold) <= 0) {
            return new CompareResult(Verdict.TOLERANCE, b.toPlainString(), detail + " · within UCP 30(b) ±10%");
        }
        return new CompareResult(Verdict.DISCREPANCY, b.toPlainString(), detail);
    }

    private CompareResult compareDate(Object lcVal, Object docVal) {
        LocalDate a = parseDate(lcVal);
        LocalDate b = parseDate(docVal);
        if (a == null || b == null) {
            return new CompareResult(
                    normaliseText(lcVal).equals(normaliseText(docVal)) ? Verdict.MATCH : Verdict.DISCREPANCY,
                    docVal == null ? null : docVal.toString(), null);
        }
        if (a.equals(b)) return new CompareResult(Verdict.MATCH, b.toString(), null);
        long days = b.toEpochDay() - a.toEpochDay();
        return new CompareResult(Verdict.DISCREPANCY, b.toString(),
                (days > 0 ? "+" : "") + days + " day(s) vs LC");
    }

    private LocalDate parseDate(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDate ld) return ld;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        for (DateTimeFormatter f : DATE_FORMATS) {
            try { return LocalDate.parse(s, f); } catch (Exception ignored) {}
        }
        return null;
    }

    private BigDecimal parseDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal bd) return bd;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        // Strip everything except digits, sign, and decimal point.
        String s = v.toString().replaceAll("[^0-9.\\-]", "");
        if (s.isEmpty() || s.equals("-")) return null;
        try { return new BigDecimal(s); } catch (Exception e) { return null; }
    }

    /** Returns ISO currency code if input contains one (or maps from a symbol), else null. */
    private String normaliseCurrency(Object v) {
        if (v == null) return null;
        String raw = v.toString().toUpperCase(Locale.ROOT).trim();
        for (var entry : CURRENCY_SYMBOLS.entrySet()) {
            if (raw.contains(entry.getKey().toUpperCase(Locale.ROOT))) return entry.getValue();
        }
        // 3-letter ISO code embedded in raw
        var m = java.util.regex.Pattern.compile("\\b([A-Z]{3})\\b").matcher(raw);
        if (m.find()) return m.group(1);
        return null;
    }

    /** Lowercase, trim, collapse whitespace, strip diacritics, drop punctuation. */
    public String normaliseText(Object v) {
        if (v == null) return "";
        String s = v.toString();
        s = Normalizer.normalize(s, Normalizer.Form.NFKD).replaceAll("\\p{M}+", "");
        s = s.toLowerCase(Locale.ROOT);
        s = s.replaceAll("[\\p{Punct}]", " ");
        s = s.replaceAll("\\s+", " ").trim();
        return s;
    }

    /** Returns the canonical unit name if the input matches any unit group, else null. */
    private String unitGroupOf(String normalised) {
        if (normalised == null || normalised.isEmpty()) return null;
        for (List<String> group : UNIT_GROUPS) {
            for (String alias : group) {
                if (normalised.equals(alias) || normalised.endsWith(" " + alias)) {
                    return group.get(0);  // first item is canonical
                }
            }
        }
        return null;
    }

    public enum Verdict { MATCH, TOLERANCE, DISCREPANCY, MISSING }

    public record CompareResult(Verdict verdict, String normalisedValue, String detail) {}
}
