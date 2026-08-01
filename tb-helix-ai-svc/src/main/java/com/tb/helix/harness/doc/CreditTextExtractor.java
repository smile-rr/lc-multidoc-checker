package com.tb.helix.harness.doc;

/**
 * Turns whatever form the credit arrived in into either plain SWIFT text or a signal that
 * vision must read a scanned PDF.
 *
 * <p>Officers upload a letter of credit as a terminal dump ({@code .txt}/{@code .swift}),
 * a text-layer PDF, a Word file, or a scan. The SWIFT reader and the credit model both take
 * UTF-8 text. This port either produces that text cheaply, or says the pages need a model.
 *
 * <p>Legacy {@code .doc} is refused. Scanned PDFs are <em>not</em> refused here — intake
 * stores the PDF and transcribes it on its own thread.
 */
public interface CreditTextExtractor {

    /**
     * Classifies and, when possible, extracts UTF-8 text.
     *
     * @param bytes    the upload as received
     * @param fileName original filename; used as a hint when magic bytes are ambiguous
     * @throws com.tb.helix.infra.error.DocumentException if the format is unsupported or corrupt
     */
    CreditMaterial materialize(byte[] bytes, String fileName);
}
