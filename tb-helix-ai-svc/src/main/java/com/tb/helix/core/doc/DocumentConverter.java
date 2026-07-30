package com.tb.helix.core.doc;

import com.tb.helix.core.blob.BlobRef;

/**
 * Turns whatever arrived into the one format everything downstream assumes.
 *
 * <p>Presentations arrive as multi-page TIFF as often as PDF, because that is what fax
 * and scanner workflows produce. The browser's viewer renders PDF, and the page renderer
 * reads PDF, so conversion happens once at intake and nothing after it needs to know
 * which form the bundle came in.
 *
 * <p>The original is never discarded. It is evidence, and a conversion is an
 * interpretation of it.
 */
public interface DocumentConverter {

    /** Whether this media type needs converting at all. PDF does not. */
    boolean needsConversion(String mediaType);

    /**
     * Converts to PDF and stores the result, returning its address.
     *
     * <p>Cached under {@code convert.tiff_pdf} keyed on the source digest, so the same
     * bundle uploaded twice converts once. Deterministic, so the entry never expires.
     *
     * @param sourceSha the stored original — already in the blob store, because the
     *                  thing that arrived is kept before anything is done to it
     * @throws com.tb.helix.core.error.DocumentException if the source cannot be decoded
     */
    BlobRef toPdf(String sourceSha);
}
