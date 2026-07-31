package com.tb.helix.lccheck.stage.intake;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The credit as it was transmitted: one file, however many messages.
 *
 * <p>The officer uploads a single {@code lc.txt}. What is in it is whatever the bank's
 * terminal printed — often the MT700 alone, but just as often the issue followed by its
 * continuation and two amendments, and sometimes a free-format note explaining one of them.
 * The terms an examination measures against are what is left after all of that is applied in
 * order, which is why nothing downstream is given a single message to read.
 *
 * @param raw      the file, byte for byte as uploaded
 * @param messages in the order sent — {@code messages.get(0)} is the earliest
 * @param lines    every line of the file, in file order, each anchored for the viewer
 */
public record SwiftFile(String raw, List<SwiftMessage> messages, List<Map<String, Object>> lines) {

    /**
     * The message that established the terms, if one did.
     *
     * <p>Empty for a file holding only amendments or only free format — which is a real
     * upload, and one worth telling the officer about rather than reading as a credit.
     */
    public SwiftMessage credit() {
        return messages.stream().filter(m -> m.type().isCredit()).findFirst().orElse(null);
    }

    public boolean hasCredit() {
        return credit() != null;
    }

    public List<SwiftMessage> amendments() {
        return messages.stream().filter(m -> m.type().isAmendment()).toList();
    }

    /** What this file is, for a document label: "Letter of credit", "…as amended (2)". */
    public String label() {
        if (!hasCredit()) {
            return messages.isEmpty() ? "Credit message" : messages.get(0).type().label();
        }
        int amended = amendments().size();
        return amended == 0 ? "Letter of credit" : "Letter of credit, as amended (" + amended + ")";
    }

    /** The tape's account of what arrived: one row per message, in order. */
    public List<Map<String, Object>> manifest() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (SwiftMessage m : messages) {
            out.add(Map.of(
                    "seq", m.seq(),
                    "type", m.type().code(),
                    "label", m.type().label(),
                    "reference", m.tag("20") == null ? "" : firstLine(m.tag("20"))));
        }
        return out;
    }

    private static String firstLine(String s) {
        int i = s.indexOf('\n');
        return (i < 0 ? s : s.substring(0, i)).strip();
    }
}
