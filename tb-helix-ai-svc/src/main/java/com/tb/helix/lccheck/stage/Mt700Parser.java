package com.tb.helix.lccheck.stage;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The credit, read out of its SWIFT message.
 *
 * <p>MT700 block 4 is a sequence of {@code :TAG:value} fields, values running to the next
 * tag. Parsed here rather than by a SWIFT library because we need two things a library does
 * not give: the raw text preserved line for line, so the UI can highlight the exact line a
 * fact came from, and tolerance for the slightly-off messages that arrive in practice.
 *
 * <p>Every value keeps its {@code anchorId} ({@code tag-31D}). That is what lets an officer
 * hover a fact and see the line of the credit it was read from, and it must stay stable
 * across a re-read or provenance silently points at the wrong line.
 */
@Component
public class Mt700Parser {

    private static final Pattern TAG = Pattern.compile("^:([0-9]{2}[A-Z]?):", Pattern.MULTILINE);
    private static final DateTimeFormatter YYMMDD = DateTimeFormatter.ofPattern("yyMMdd");

    /** Tag values in order of appearance, plus the credit terms derived from them. */
    public record Parsed(Map<String, String> tags, Map<String, Object> credit, List<Map<String, Object>> lines) {
    }

    public Parsed parse(String raw) {
        String body = block4(raw);
        Map<String, String> tags = new LinkedHashMap<>();

        Matcher m = TAG.matcher(body);
        List<int[]> spans = new ArrayList<>();
        List<String> names = new ArrayList<>();
        while (m.find()) {
            spans.add(new int[] { m.start(), m.end() });
            names.add(m.group(1));
        }
        for (int i = 0; i < spans.size(); i++) {
            int from = spans.get(i)[1];
            int to = i + 1 < spans.size() ? spans.get(i + 1)[0] : body.length();
            // First value wins: a malformed message repeating a tag should not have the
            // later occurrence silently overwrite the one the bank actually meant.
            tags.putIfAbsent(names.get(i), body.substring(from, to).strip());
        }

        return new Parsed(tags, credit(tags), lines(raw));
    }

    /** The lines the viewer renders, each anchored so a fact can point at one. */
    private List<Map<String, Object>> lines(String raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        String currentTag = null;
        int n = 0;
        for (String line : raw.split("\\R")) {
            Matcher m = Pattern.compile("^:([0-9]{2}[A-Z]?):").matcher(line);
            if (m.find()) currentTag = m.group(1);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", currentTag == null ? "line-" + n : "tag-" + currentTag);
            row.put("text", line);
            if (currentTag != null) row.put("tag", currentTag);
            out.add(row);
            n++;
        }
        return out;
    }

    private Map<String, Object> credit(Map<String, String> t) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("creditRef", firstLine(t.get("20")));
        c.put("issuedDate", date(t.get("31C")));
        c.put("applicant", firstLine(t.get("50")));
        c.put("beneficiary", firstLine(t.get("59")));

        String amount = t.get("32B");
        if (amount != null) {
            String cleaned = amount.replaceAll("(?i)^(ABOUT|APPROXIMATELY)\\s+", "").strip();
            if (cleaned.length() > 3) {
                c.put("currency", cleaned.substring(0, 3));
                // SWIFT writes decimals with a comma. Left as-is it parses as a thousands
                // separator, and USD 45,000.00 becomes forty-five million.
                c.put("amount", num(cleaned.substring(3).replace(",", ".")));
            }
        }
        c.put("tolerancePct", tolerance(t.get("39A")));
        c.put("latestShipment", date(t.get("44C")));
        c.put("expiry", date(t.get("31D")));
        c.put("expiryPlace", placeOf(t.get("31D")));
        c.put("presentationDays", presentationDays(t.get("48")));
        c.put("tenor", firstLine(t.get("42C")));
        c.put("goods", t.get("45A"));
        c.put("availableWith", firstLine(t.get("41D") != null ? t.get("41D") : t.get("41A")));
        c.put("requiredDocs", t.get("46A"));
        c.put("conditions", t.get("47A"));
        return c;
    }

    // :31D: is YYMMDD followed by the place. Both matter — 6(e) is about the date, and
    // where a credit expires decides where it may be presented.
    private String date(String value) {
        if (value == null) return null;
        String digits = value.strip().replaceAll("^(\\d{6}).*$", "$1");
        if (!digits.matches("\\d{6}")) return null;
        try {
            return LocalDate.parse(digits, YYMMDD).toString();
        } catch (Exception e) {
            return null;
        }
    }

    private String placeOf(String value) {
        if (value == null) return null;
        String rest = value.strip().replaceFirst("^\\d{6}", "").strip();
        return rest.isEmpty() ? null : firstLine(rest);
    }

    private Double tolerance(String value) {
        if (value == null) return 0.0;
        Matcher m = Pattern.compile("(\\d+)").matcher(value);
        return m.find() ? Double.parseDouble(m.group(1)) : 0.0;
    }

    private Integer presentationDays(String value) {
        if (value == null) return null;
        Matcher m = Pattern.compile("(\\d+)").matcher(value);
        return m.find() ? Integer.parseInt(m.group(1)) : null;
    }

    private String firstLine(String value) {
        if (value == null) return null;
        String s = value.strip();
        int nl = s.indexOf('\n');
        return nl < 0 ? s : s.substring(0, nl).strip();
    }

    private Double num(String s) {
        try {
            return Double.parseDouble(s.replaceAll("[^0-9.]", ""));
        } catch (Exception e) {
            return null;
        }
    }

    private String block4(String raw) {
        int i = raw.indexOf("{4:");
        if (i < 0) return raw;
        int end = raw.lastIndexOf("-}");
        return raw.substring(i + 3, end > i ? end : raw.length());
    }
}
