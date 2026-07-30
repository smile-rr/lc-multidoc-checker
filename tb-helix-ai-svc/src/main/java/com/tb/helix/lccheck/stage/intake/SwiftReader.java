package com.tb.helix.lccheck.stage.intake;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The mechanical half of reading a SWIFT message.
 *
 * <p>Splits blocks, identifies the message type, and gives every line a stable anchor. It
 * decides nothing: which tag is the expiry and whether "241231" is a date are questions for
 * {@link CreditReader}.
 *
 * <p>Kept as code rather than handed to a model because it must be <em>exact</em> and
 * <em>stable</em>. A fact points at {@code tag-31D} and the viewer highlights that line; a
 * model that renumbered lines between two reads would move every highlight in the case, and
 * nothing about splitting on {@code :NN[A]:} needs judgement.
 */
@Component
public class SwiftReader {

    private static final Pattern TAG = Pattern.compile("^:([0-9]{2}[A-Z]?):", Pattern.MULTILINE);
    private static final Pattern LINE_TAG = Pattern.compile("^:([0-9]{2}[A-Z]?):");
    // {2:O7001200...} or {2:I700BANKBIC...} — the three digits after the direction letter.
    private static final Pattern HEADER_TYPE = Pattern.compile("\\{2:[IO](\\d{3})");

    public SwiftMessage read(String raw) {
        String text = raw == null ? "" : raw;
        String block4 = block4(text);
        Map<String, String> tags = tags(block4);
        return new SwiftMessage(detectType(text, tags), text, block4, tags, lines(text));
    }

    /**
     * Which message this is.
     *
     * <p>The application header is authoritative when present. Falling back to the field
     * shape is deliberate: messages arrive pasted out of terminals with their envelope
     * stripped, and refusing to read one because its header is missing helps nobody.
     */
    private SwiftMessageType detectType(String raw, Map<String, String> tags) {
        Matcher m = HEADER_TYPE.matcher(raw);
        if (m.find()) return SwiftMessageType.of(m.group(1));

        // :20: with :31D: and :32B: is a credit; :20: with :21: referring to another
        // message and no amount is an amendment; narrative alone is free format.
        boolean hasRef = tags.containsKey("20");
        if (hasRef && tags.containsKey("31D") && tags.containsKey("32B")) return SwiftMessageType.MT700;
        if (hasRef && tags.containsKey("21") && !tags.containsKey("32B")) return SwiftMessageType.MT707;
        if (tags.containsKey("79")) return SwiftMessageType.MT799;
        return SwiftMessageType.UNKNOWN;
    }

    private String block4(String raw) {
        int i = raw.indexOf("{4:");
        if (i < 0) return raw;
        int end = raw.lastIndexOf("-}");
        return raw.substring(i + 3, end > i ? end : raw.length());
    }

    /** Raw tag text, first occurrence winning. */
    private Map<String, String> tags(String block4) {
        Map<String, String> tags = new LinkedHashMap<>();
        Matcher m = TAG.matcher(block4);

        List<int[]> spans = new ArrayList<>();
        List<String> names = new ArrayList<>();
        while (m.find()) {
            spans.add(new int[] { m.start(), m.end() });
            names.add(m.group(1));
        }
        for (int i = 0; i < spans.size(); i++) {
            int from = spans.get(i)[1];
            int to = i + 1 < spans.size() ? spans.get(i + 1)[0] : block4.length();
            // First wins: a malformed message repeating a tag should not have the later
            // occurrence silently replace the one the bank meant.
            tags.putIfAbsent(names.get(i), block4.substring(from, to).strip());
        }
        return tags;
    }

    /**
     * The lines the viewer renders, each anchored.
     *
     * <p>A continuation line inherits the tag above it, so a fact read from the third line
     * of {@code :45A:} still highlights that field rather than nothing.
     */
    private List<Map<String, Object>> lines(String raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        String currentTag = null;
        int n = 0;
        for (String line : raw.split("\\R")) {
            Matcher m = LINE_TAG.matcher(line);
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
}
