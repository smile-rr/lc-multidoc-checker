package com.tb.helix.lccheck.types.document;

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
        /**
         * The dictionary key, when the reading folded onto one.
         *
         * <p>The workbench already read this — the Source pane emits {@code key} from it, and
         * the presence strip groups by it — but nothing ever sent it, so it was undefined on
         * every fact. Null for a reading the dictionary does not cover.
         */
        String fieldKey,
        String label,
        String value,
        String source,
        String sourceText,
        String confidence,
        String flag) {
}
