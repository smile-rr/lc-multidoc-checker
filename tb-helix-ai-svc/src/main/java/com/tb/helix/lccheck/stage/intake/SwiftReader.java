package com.tb.helix.lccheck.stage.intake;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The mechanical half of reading a credit file.
 *
 * <p>Cuts the file into messages, splits each into blocks, identifies its type, and gives
 * every line a stable anchor. It decides nothing: which tag is the expiry, whether "241231"
 * is a date, and which of two expiries stands are questions for {@link CreditReader}.
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
    // The start of an envelope. Where these exist, they are the message boundaries and
    // nothing else has to be guessed.
    private static final Pattern ENVELOPE = Pattern.compile("^\\{1:", Pattern.MULTILINE);
    // Every MT7xx block 4 opens with :20:, the sender's own reference. Used only as a
    // boundary when the envelopes were stripped — which is what a terminal paste looks like.
    private static final Pattern SENDERS_REF = Pattern.compile("^:20:", Pattern.MULTILINE);

    /**
     * Everything in the upload, in the order it was sent.
     *
     * <p>The file is the unit, not the message. An MT707 read on its own says the expiry is
     * now March and nothing else; read after the MT700 above it, it says the expiry moved.
     * Only one of those is a credit.
     */
    public SwiftFile read(String raw) {
        String text = raw == null ? "" : raw;
        List<String> parts = split(text);

        List<SwiftMessage> messages = new ArrayList<>();
        List<Map<String, Object>> allLines = new ArrayList<>();
        int lineNo = 0;

        for (int i = 0; i < parts.size(); i++) {
            String part = parts.get(i);
            int seq = i + 1;
            String block4 = block4(part);
            Map<String, String> tags = tags(block4);
            // The first message keeps bare `tag-31D` anchors. Every anchor already written
            // against a case points at that form, and a prefix on message one would move
            // all of them for no gain — the ambiguity only begins at the second message.
            String prefix = seq == 1 ? "" : "m" + seq + "-";
            List<Map<String, Object>> lines = lines(part, prefix, lineNo);
            lineNo += lines.size();

            messages.add(new SwiftMessage(seq, detectType(part, tags), part, block4, tags, lines));
            allLines.addAll(lines);
        }
        return new SwiftFile(text, messages, allLines);
    }

    /**
     * Where one message ends and the next begins.
     *
     * <p>Envelopes first, because {@code {1:} is unambiguous. Failing that, a fresh
     * {@code :20:} — every category-7 message opens with one, so a second occurrence is a
     * second message. Failing both, the file is one message, which is the common case and
     * must stay the cheap one.
     */
    private List<String> split(String text) {
        List<String> byEnvelope = splitOn(text, ENVELOPE);
        if (byEnvelope.size() > 1) return byEnvelope;
        return splitOn(text, SENDERS_REF);
    }

    private List<String> splitOn(String text, Pattern boundary) {
        Matcher m = boundary.matcher(text);
        List<Integer> starts = new ArrayList<>();
        while (m.find()) starts.add(m.start());
        if (starts.size() < 2) return List.of(text);

        List<String> parts = new ArrayList<>();
        // Text before the first boundary belongs to the first message, not to nothing.
        int from = 0;
        for (int i = 1; i < starts.size(); i++) {
            parts.add(text.substring(from, starts.get(i)));
            from = starts.get(i);
        }
        parts.add(text.substring(from));
        return parts;
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
     *
     * @param prefix scopes the anchor to its message, so the {@code :31D:} of an amendment
     *               does not collide with the one it amends
     */
    private List<Map<String, Object>> lines(String raw, String prefix, int offset) {
        List<Map<String, Object>> out = new ArrayList<>();
        String currentTag = null;
        int n = offset;
        for (String line : raw.split("\\R")) {
            Matcher m = LINE_TAG.matcher(line);
            if (m.find()) currentTag = m.group(1);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", currentTag == null ? prefix + "line-" + n : prefix + "tag-" + currentTag);
            row.put("text", line);
            if (currentTag != null) row.put("tag", currentTag);
            out.add(row);
            n++;
        }
        return out;
    }
}
