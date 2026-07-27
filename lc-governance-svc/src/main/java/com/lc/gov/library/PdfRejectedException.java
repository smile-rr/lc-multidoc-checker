package com.lc.gov.library;

/**
 * The upload was a PDF we will not import — an image-only scan, an encrypted
 * file, or not a PDF at all. Surfaces as 422 with the reason, so the message is
 * the user-facing explanation and should read as one.
 */
public class PdfRejectedException extends RuntimeException {

    public PdfRejectedException(String message) {
        super(message);
    }
}
