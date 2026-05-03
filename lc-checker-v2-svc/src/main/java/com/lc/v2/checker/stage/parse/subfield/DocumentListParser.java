package com.lc.v2.checker.stage.parse.subfield;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.DocumentRequirement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Splits :46A: into one DocumentRequirement per "+" bullet, classifying each
 * block into a v2 DocType. UNKNOWN is the fallback; rawText is always preserved.
 */
@Component
public class DocumentListParser {

    private static final Pattern WORD_NUMBER = Pattern.compile(
            "(?i)\\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TRIPLICATE|DUPLICATE|QUADRUPLICATE)\\b");
    private static final Pattern DIGIT_NUMBER = Pattern.compile(
            "(\\d+)\\s*(?:/\\d+\\s+)?(?:ORIGINAL|COPY|COPIES|ORIGINALS)");
    private static final Pattern CONSIGNEE = Pattern.compile(
            "(?i)MADE\\s+OUT\\s+TO\\s+ORDER\\s+OF\\s+([A-Z0-9 ,.&'-]+?)(?=\\s+(?:MARKED|NOTIFY|FREIGHT)|$)");
    private static final Pattern NOTIFY = Pattern.compile(
            "(?i)NOTIFY\\s+([A-Z0-9 ,.&'-]+?)(?=\\s+(?:MARKED|FREIGHT)|$)");
    private static final Pattern FREIGHT = Pattern.compile("(?i)FREIGHT\\s+(PREPAID|COLLECT)");
    private static final Pattern ISSUED_BY = Pattern.compile(
            "(?i)ISSUED\\s+BY\\s+([A-Z0-9 ,.&'-]+?)(?=\\s+(?:IN\\s+|AND|$))");

    private static final Map<String, Integer> WORD_TO_INT;
    static {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("ONE", 1); m.put("TWO", 2); m.put("THREE", 3); m.put("FOUR", 4);
        m.put("FIVE", 5); m.put("SIX", 6); m.put("SEVEN", 7); m.put("EIGHT", 8);
        m.put("NINE", 9); m.put("TEN", 10);
        m.put("TRIPLICATE", 3); m.put("DUPLICATE", 2); m.put("QUADRUPLICATE", 4);
        WORD_TO_INT = Map.copyOf(m);
    }

    public List<DocumentRequirement> parse(String raw46A) {
        if (raw46A == null || raw46A.isBlank()) return List.of();
        List<String> blocks = splitBlocks(raw46A);
        List<DocumentRequirement> out = new ArrayList<>(blocks.size());
        for (String block : blocks) out.add(parseBlock(block));
        return List.copyOf(out);
    }

    private List<String> splitBlocks(String raw) {
        String normalised = raw.replace("\r\n", "\n").trim();
        List<String> blocks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : normalised.split("\n")) {
            String l = line.trim();
            if (l.startsWith("+")) {
                if (current.length() > 0) { blocks.add(current.toString().trim()); current.setLength(0); }
                current.append(l.substring(1).trim());
            } else {
                if (current.length() > 0) current.append(' ');
                current.append(l);
            }
        }
        if (current.length() > 0) blocks.add(current.toString().trim());
        if (blocks.size() == 1 && raw.contains("\n") && !raw.contains("+")) {
            blocks.clear();
            for (String l : normalised.split("\n")) { String t = l.trim(); if (!t.isEmpty()) blocks.add(t); }
        }
        return blocks;
    }

    private DocumentRequirement parseBlock(String block) {
        String upper = block.toUpperCase();
        DocType type = classify(upper);
        Integer originals = matchCount(upper, "ORIGINAL");
        Integer copies = matchCount(upper, "COP");
        if (originals == null && copies == null) { Integer maybe = wordNumber(upper); if (maybe != null) originals = maybe; }
        boolean signed = upper.contains("SIGNED");
        boolean fullSet = upper.contains("FULL SET");
        boolean onBoard = upper.contains("ON BOARD") || upper.contains("ONBOARD");
        String consignee = firstGroup(CONSIGNEE.matcher(upper));
        String notify = firstGroup(NOTIFY.matcher(upper));
        String issuedBy = firstGroup(ISSUED_BY.matcher(upper));
        String freight = null;
        Matcher fm = FREIGHT.matcher(upper);
        if (fm.find()) freight = fm.group(1).toUpperCase();
        return new DocumentRequirement(type, originals, copies, signed, fullSet, onBoard,
                consignee, freight, notify, issuedBy, block);
    }

    private DocType classify(String upper) {
        if (upper.contains("BILL OF LADING") || upper.contains("BILLS OF LADING") || upper.contains("B/L"))
            return DocType.BOL;
        if (upper.contains("AIRWAY BILL") || upper.contains("AIR WAYBILL") || upper.contains("AWB"))
            return DocType.AWB;
        if (upper.contains("CERTIFICATE OF ORIGIN") || upper.contains("CERT OF ORIGIN") || upper.contains("ORIGIN CERT"))
            return DocType.COO;
        if (upper.contains("PACKING LIST"))
            return DocType.PKL;
        if (upper.contains("INSURANCE"))
            return DocType.INS;
        if (upper.contains("BILL OF EXCHANGE") || upper.contains("DRAFT"))
            return DocType.BOE;
        if (upper.contains("BENEFICIARY CERTIFICATE") || upper.contains("BENEFICIARY CERT"))
            return DocType.BC;
        if (upper.contains("WARRANTY"))
            return DocType.WC;
        if (upper.contains("COMMERCIAL INVOICE") || upper.contains("INVOICE"))
            return DocType.INV;
        return DocType.UNKNOWN;
    }

    private Integer matchCount(String upper, String unitToken) {
        Matcher m = DIGIT_NUMBER.matcher(upper);
        while (m.find()) {
            String unit = m.group(0).toUpperCase();
            if (unit.contains(unitToken)) {
                try { return Integer.valueOf(m.group(1)); } catch (NumberFormatException ignored) {}
            }
        }
        Matcher w = WORD_NUMBER.matcher(upper);
        while (w.find()) {
            int idx = w.end();
            String tail = idx + 30 <= upper.length() ? upper.substring(idx, idx + 30) : upper.substring(idx);
            if (tail.contains(unitToken)) { Integer n = WORD_TO_INT.get(w.group(1).toUpperCase()); if (n != null) return n; }
        }
        return null;
    }

    private Integer wordNumber(String upper) {
        Matcher w = WORD_NUMBER.matcher(upper);
        if (w.find()) return WORD_TO_INT.get(w.group(1).toUpperCase());
        return null;
    }

    private String firstGroup(Matcher m) {
        if (m.find()) { String g = m.group(1).trim(); return g.isEmpty() ? null : g; }
        return null;
    }
}
