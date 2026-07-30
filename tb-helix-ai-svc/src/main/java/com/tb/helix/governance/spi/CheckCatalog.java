package com.tb.helix.governance.spi;

import java.util.List;

/**
 * The rulebook, as lc-check needs it.
 *
 * <p>Declared here — by the consumer — rather than exported by governance. That is what
 * lets governance become a separate service later without lc-check changing: today the
 * implementation reads the same database, tomorrow it could make an HTTP call, and the
 * examination would not notice.
 *
 * <p>It is also why the two business modules never reference each other, which the build
 * enforces.
 */
public interface CheckCatalog {

    /**
     * One authored check, flattened to what an examination needs.
     *
     * @param tier      EXACT or JUDGED — derived from checkType, not stored twice
     * @param isGate    the author's assertion that a failure ends the examination
     * @param body      plain language with {field} tokens. For a judged check this IS the
     *                  prompt, not a description of one.
     * @param rule      condition tree for an exact check; null for judged
     */
    record CheckCard(
            String id,
            String title,
            String body,
            String domain,
            String severity,
            String checkType,
            String tier,
            boolean isGate,
            String citedAs,
            List<String> refs,
            List<String> fieldRefs,
            List<String> docTypes,
            Object rule) {

        public boolean exact() {
            return "EXACT".equals(tier);
        }
    }

    /** Every active check in the pinned catalogue. */
    List<CheckCard> activeChecks();

    /**
     * The hard checks, in the order they should run.
     *
     * <p>Separate from {@link #activeChecks()} because the gate stage runs before the plan
     * exists — it cannot filter a list it has not built yet.
     */
    List<CheckCard> gates();

    /** Resolves a citation to its text, for a prompt that must quote the article it applies. */
    String articleText(String code);
}
