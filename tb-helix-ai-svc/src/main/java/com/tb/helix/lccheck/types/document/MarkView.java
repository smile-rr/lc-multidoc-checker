package com.tb.helix.lccheck.types.document;

/**
 * Something on a document that is not text — a signature, a chop, an initialled correction.
 *
 * <p>Shown beside the fields rather than among them, because a document carries several and
 * a field carries one value. The workbench draws them as their own list for the same reason
 * an examiner reads them separately: whether the page was executed properly is a different
 * question from what it says.
 *
 * @param legible false when the mark is there and cannot be read. Paired with a null
 *                {@code readsAs}, this is the distinction the whole reading exists to keep —
 *                a document carrying an unreadable signature is not an unsigned document,
 *                and only one of those is a discrepancy.
 * @param capacity 'as agent for XYZ Lines, the carrier'. UCP 600 art. 20(a)(i) is not
 *                satisfied by a signature that does not state this, so it is shown even
 *                when every other detail is null.
 */
public record MarkView(
        String docId,
        String kind,
        Integer page,
        String placement,
        String readsAs,
        String party,
        String capacity,
        String medium,
        String authenticates,
        boolean legible,
        String confidence) {
}
