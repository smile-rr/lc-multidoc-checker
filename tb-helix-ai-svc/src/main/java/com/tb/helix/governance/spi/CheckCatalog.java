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
     * One dictionary field, as it is read from one document.
     *
     * <p>A binding, not a field: what a field is called and how it is read depends on where
     * it is read from. An invoice's total is "total", "grand total" or "amount due"; the
     * same value on a draft is just "amount". The predecessor kept one alias list per field
     * and had to reject a second field claiming an alias already taken — so "date" could
     * mean exactly one thing across every document type. A binding already knows which
     * document it is talking about.
     *
     * @param key     the dictionary key — what a fact is stored under and what a rule cites
     * @param name    the label, for prose and for screens
     * @param kind    which reading answers it. {@code DOC_ATTESTATION} is a property of the
     *                page — signed, original, initialled — and is settled by looking at the
     *                page rather than by reading characters off it, so it goes to a
     *                different pass. Anything else is ordinary extraction.
     * @param note    how to read it on this document, in the author's words. Goes into the
     *                extraction prompt verbatim.
     * @param aliases what this document tends to call it, for folding an open-world reading
     *                back onto the key
     */
    record FieldBinding(String key, String name, String valueType, String kind, String docCode,
                        String note, List<String> aliases) {

        /** Whether this is read by looking at the page rather than by reading its text. */
        public boolean attestation() {
            return ATTESTATION.equals(kind);
        }
    }

    /**
     * The {@code kind} that routes a binding to the attest pass.
     *
     * <p>Here rather than in lc-check because it is a vocabulary term: the dictionary says
     * what a field is, and the examination obeys. A constant so the two sides cannot drift
     * on a spelling.
     */
    String ATTESTATION = "DOC_ATTESTATION";

    /**
     * Everything the dictionary says is readable from this document.
     *
     * <p>This is the extraction spec. The prompt that reads a document is built from it, so
     * the dictionary and the prompt cannot drift — which is exactly what went wrong when
     * they were a YAML list and a hand-written template that each named the same fields.
     */
    List<FieldBinding> bindingsFor(String docCode);

    /**
     * Every dictionary field of one kind, regardless of what it is bound to.
     *
     * <p>Exists for the attestation vocabulary. Whether a document is signed, sealed,
     * corrected, original or endorsed is asked of <em>every</em> document worth looking at —
     * a binding decides whether to look at all, not whether the answer has a name. Without a
     * way to resolve those keys outside a binding, an invoice's company chop came back under
     * a key no rule could cite and marked "not in the dictionary", which is exactly wrong:
     * the dictionary has the field, this document simply had no binding to it.
     *
     * <p>{@code docCode} is null on what comes back — these are fields, not bindings.
     */
    List<FieldBinding> fieldsOfKind(String kind);

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
