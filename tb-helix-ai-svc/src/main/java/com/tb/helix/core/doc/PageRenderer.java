package com.tb.helix.core.doc;

import java.util.List;

/**
 * PDF pages to images, for a vision model to read.
 *
 * <p>Rendered pages are model input and nothing else — the browser is served the PDF and
 * renders it itself. So renders are not persisted by default: a page at 200 DPI is about
 * 1.5 MB, a render is a second or two, and the cache is consulted before rendering
 * happens at all. Storing 15 MB per bundle to save two seconds on a path that also spends
 * thirty seconds in a model is a bad trade.
 *
 * <p>They are cached in memory, though, because several vision slots examining the same
 * pages in one run would otherwise each render them. That was the waste worth removing.
 */
public interface PageRenderer {

    /**
     * Renders the given pages as PNG.
     *
     * @param pdfSha      the PDF in the blob store
     * @param pageNumbers 1-based, in the order the model should see them
     * @param spec        DPI and size bounds — part of the cache key, so two specs are
     *                    two renders rather than one render silently reused
     * @return PNG bytes, one per requested page, in the requested order
     * @throws com.tb.helix.core.error.DocumentException if the PDF cannot be read
     */
    List<byte[]> render(String pdfSha, List<Integer> pageNumbers, RenderSpec spec);

    /** Pages in the document. Reads the page tree only, not the content streams. */
    int pageCount(String pdfSha);

    /**
     * Extracts a page range into a PDF of its own.
     *
     * <p>On demand rather than stored: a bundle's documents are page ranges within one
     * scanned file, and splitting eagerly writes N near-duplicates of bytes already held.
     */
    byte[] extractPages(String pdfSha, List<Integer> pageNumbers);
}
