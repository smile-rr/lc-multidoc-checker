package com.tb.helix.harness.doc;

/**
 * What {@link CreditTextExtractor} made of an upload.
 *
 * <p>{@link PlainText} is ready for the SWIFT reader. {@link ScannedPdf} means the bytes are
 * a PDF with no usable text layer — the pages have to be read by vision, which is slow and
 * belongs on the intake pipeline thread, not on the upload request.
 */
public sealed interface CreditMaterial {

    /** UTF-8 SWIFT (or near-SWIFT) text, already extracted. */
    record PlainText(String text) implements CreditMaterial {
        public PlainText {
            if (text == null || text.isBlank()) {
                throw new IllegalArgumentException("plain credit text must not be blank");
            }
        }
    }

    /**
     * A PDF whose text layer is empty or nearly so.
     *
     * <p>The original bytes stay with the caller (and are stored as the credit source). This
     * type carries no payload — it is only the signal that vision must run later.
     */
    record ScannedPdf() implements CreditMaterial {
    }
}
