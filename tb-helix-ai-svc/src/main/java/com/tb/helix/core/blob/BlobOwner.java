package com.tb.helix.core.blob;

/**
 * What kind of thing can hold a reference to a blob.
 *
 * <p>An enum rather than a free string because the set is small, closed, and used as
 * half of a primary key — a typo'd owner kind would create a reference that no release
 * ever finds, and the blob would live forever.
 */
public enum BlobOwner {

    /** An examination. Its uploads and converted bundle hang off it. */
    CASE,

    /** A cached derivation whose result is bytes — a converted PDF, a page render. */
    DERIVATION,

    /** A governance import: an uploaded handbook or checklist. */
    GOV_IMPORT
}
