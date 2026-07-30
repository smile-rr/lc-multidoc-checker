package com.tb.helix.lccheck.domain;

import java.util.List;

/**
 * The areas an examination reports against.
 *
 * <p>Stable across credits on purpose. They are concerns an examiner already thinks in —
 * time, transport, amounts — not a grouping derived from whichever rules happened to fire,
 * which would make two cases incomparable.
 */
public final class Areas {

    private Areas() {
    }

    public static final String GATE = "gate";
    public static final String CREDIT = "credit";

    public static final List<CheckArea> ALL = List.of(
            new CheckArea(GATE, "Before anything is read", "main", 0,
                    "Hard checks that can end the examination", List.of()),
            new CheckArea("a1", "Time & availability", "domain", 1,
                    "Expiry, shipment and presentation windows", List.of()),
            new CheckArea("a2", "Transport", "domain", 1,
                    "How the goods moved and what proves it", List.of()),
            new CheckArea("a3", "Amounts & goods", "domain", 1,
                    "What was invoiced against what was called for", List.of()),
            new CheckArea("a4", "Insurance", "domain", 2,
                    "Cover, currency and the risks named", List.of()),
            new CheckArea("a5", "Documents & parties", "domain", 2,
                    "The set presented and who signed it", List.of()),
            new CheckArea(CREDIT, "This credit's own conditions", "policy", 3,
                    "Read from 46A and 47A during the run", List.of()));

    /** Which area a check belongs to, from the domain its author gave it. */
    public static String forDomain(String domain) {
        String d = domain == null ? "" : domain.toLowerCase();
        if (d.contains("time") || d.contains("expiry")) return "a1";
        if (d.contains("transport") || d.contains("shipment")) return "a2";
        if (d.contains("amount") || d.contains("invoice")) return "a3";
        if (d.contains("insurance")) return "a4";
        return "a5";
    }
}
