package com.tb.helix.lccheck.domain.document;

/**
 * A value read off a document, with its provenance.
 *
 * <p>Provenance takes one of two forms, because the two document kinds are shown
 * differently. The credit is rendered as text, so a fact points at a line ({@code anchorId})
 * and hovering highlights it. A presented document is a scan with no character
 * coordinates, so a fact points at a {@code page} and selecting it turns the viewer there.
 *
 * @param flag why a human should look, or null when unremarkable
 */
public record FactView(
        String docId,
        String anchorId,
        Integer page,
        String label,
        String value,
        String source,
        String sourceText,
        String confidence,
        String flag) {
}
