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

    /**
     * One document type, as the dictionary defines it.
     *
     * <p>Authored, not enumerated. The code is whatever the author typed — this bank writes
     * short ones as a matter of practice, and nothing in code may depend on that. A
     * consumer that branches on a code value has moved the vocabulary back into Java.
     *
     * @param role        {@code credit} or {@code schedule} when this document plays a part
     *                    an examination has to locate, null for the rest. It is how
     *                    lc-check finds the credit without naming it.
     * @param description what the document is, in the author's words. Load-bearing: this is
     *                    what the classifier is given to recognise a page by, so a better
     *                    description is better segmentation.
     */
    record DocTypeDef(String code, String name, String description,
                      String role, boolean beforeReading) {

        public boolean isCredit() {
            return "credit".equals(role);
        }

        public boolean isSchedule() {
            return "schedule".equals(role);
        }
    }

    /** Every active check in the pinned catalogue. */
    List<CheckCard> activeChecks();

    /**
     * The document vocabulary, in authoring order.
     *
     * <p>The examination's whole knowledge of what a document can be. There is no enum
     * beside this and no list in a resource file — the dictionary is the definition, and
     * adding a type is an edit in the console.
     */
    List<DocTypeDef> docTypes();

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
