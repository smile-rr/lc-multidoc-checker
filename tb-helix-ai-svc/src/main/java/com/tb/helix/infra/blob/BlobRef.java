package com.tb.helix.infra.blob;

/**
 * The address of a stored blob, plus what a caller needs to describe it without
 * fetching it.
 *
 * @param sha256       lowercase hex; the identity
 * @param byteSize     size on disk
 * @param mediaType    e.g. {@code application/pdf}
 * @param pageCount    pages, for PDF and TIFF; {@code null} when the format has no
 *                     concept of one. Carried here so nothing re-opens a document
 *                     merely to count it — a surprisingly common cost.
 * @param originalName the filename it arrived under. Not part of the identity.
 */
public record BlobRef(
        String sha256,
        long byteSize,
        String mediaType,
        Integer pageCount,
        String originalName) {

    public BlobRef {
        if (sha256 == null || sha256.length() != 64) {
            throw new IllegalArgumentException("sha256 must be 64 hex characters, got: " + sha256);
        }
    }

    /** Short form for logs and step keys, where the full digest is noise. */
    public String shortSha() {
        return sha256.substring(0, 12);
    }
}
