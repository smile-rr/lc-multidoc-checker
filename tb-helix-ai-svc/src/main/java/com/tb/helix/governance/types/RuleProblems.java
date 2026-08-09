package com.tb.helix.governance.types;

/**
 * What is wrong with a condition, in the words an author is shown.
 *
 * <p>Constants because two validators now say the same things about two languages — the tree
 * compiler and the expression compiler — and a sentence written out twice is a sentence that
 * drifts. When it does, the same mistake reads differently depending on which editor the
 * author happened to be in, and the console starts to feel like two products.
 *
 * <p>They are written to be acted on rather than to be accurate. "port_of_lading is not read
 * from BOL" tells an author what to do; "unresolved operand reference" tells them that
 * something went wrong.
 */
public final class RuleProblems {

    private RuleProblems() {
    }

    public static String notADocumentType(String doc) {
        return doc + " is not a document type in the dictionary";
    }

    public static String notReadFrom(String field, String doc) {
        return field + " is not read from " + doc;
    }

    public static String notReadAnywhere(String field) {
        return field + " is not read from any document, so reading it off every document "
                + "reads it off none";
    }

    public static String namesNothing(String side) {
        return "the " + side + " side names no document and field";
    }

    public static String bothSidesWildcard() {
        return "both sides read every document, which compares nothing to nothing";
    }

    public static String notAnOperator() {
        return "that is not an operator this examination knows";
    }

    public static String readingNotComparison(String op) {
        return "\"" + op + "\" is a reading rather than a comparison";
    }

    /**
     * A name that is not {@code DOCUMENT.field}.
     *
     * <p>Its own sentence because it is the mistake a person makes first: the expression
     * language reads {@code {LC.expiry_date}}, and {@code {expiry_date}} looks close enough
     * to be worth saying why it is not.
     */
    public static String notADocumentAndField(String name) {
        return "{" + name + "} must name a document and a field, as {LC.expiry_date}";
    }

    /**
     * Two values that cannot be ordered against each other.
     *
     * <p>Not a safety problem — the engine answers "could not be settled" rather than
     * inventing an order — but an author who wrote it meant something, and finding out at
     * authoring time is the difference between fixing it and shipping a check that is
     * permanently unanswerable.
     */
    public static String notComparable(String a, String b) {
        return a + " and " + b + " are not the same kind of value, so one cannot be "
                + "greater or less than the other";
    }

    /** Ordering text is almost never what an author meant, and never what UCP means. */
    public static String textHasNoOrder(String name) {
        return name + " is text, and text has no order — use #same, #differs or #contains "
                + "rather than < or >";
    }

    /** {@code ==} on text is exact; folding is a verb, so that the author chooses. */
    public static String textNeedsSame(String name) {
        return name + " is text, and == compares it exactly — use #same, which ignores case "
                + "and spacing, or #differs for the opposite";
    }
}
