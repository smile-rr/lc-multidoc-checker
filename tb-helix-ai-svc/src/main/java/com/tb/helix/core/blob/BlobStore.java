package com.tb.helix.core.blob;

import java.io.InputStream;
import java.util.Optional;

/**
 * Where bytes live.
 *
 * <p>Content-addressed: the SHA-256 of the content <em>is</em> the identity. Storing the
 * same bytes twice is one object and one row, which is what makes re-presenting a bundle
 * free rather than merely fast.
 *
 * <p>Two implementations are expected — a filesystem one (today) and an object-store one
 * (when there is an object store). Callers see neither. The disk layout is deliberately
 * shaped like an object key (<code>cas/ab/cd/&lt;sha&gt;</code>) so the second
 * implementation is a new class rather than a migration.
 *
 * <p>Everything here is immutable. There is no update and no overwrite: different bytes
 * are a different address. Deletion exists only for garbage collection of blobs nothing
 * references, and even that is on a long grace period — the thing being collected is
 * evidence.
 */
public interface BlobStore {

    /**
     * Stores bytes and returns their address, or returns the existing address if these
     * exact bytes are already held.
     *
     * <p>Idempotent by construction. A caller that cannot remember whether it already
     * stored something should simply store it again.
     *
     * @param content       the bytes; the caller keeps ownership of the array
     * @param mediaType     e.g. {@code application/pdf}
     * @param originalName  the filename it arrived under, for human inspection only —
     *                      it is not part of the identity, because the same document
     *                      under two names is one document
     */
    BlobRef put(byte[] content, String mediaType, String originalName);

    /** Reads a blob whole. Prefer {@link #open} for anything that streams to a response. */
    Optional<byte[]> get(String sha256);

    /**
     * Opens a blob for streaming. The caller closes it.
     *
     * <p>Separate from {@link #get} because serving a 60 MB bundle to a PDF viewer must
     * not first materialise it on the heap.
     */
    Optional<InputStream> open(String sha256);

    /** Whether these bytes are already held. Cheap — an index lookup, never a read. */
    boolean exists(String sha256);

    /**
     * Records how many pages a stored document has.
     *
     * <p>Separate from {@link #put} because the store deals in bytes and has no business
     * knowing what a page is. Whoever opened the document — the converter, the renderer —
     * already knows, and telling the catalogue here is what stops everything downstream
     * re-opening a PDF merely to count it.
     */
    void recordPageCount(String sha256, int pageCount);

    /**
     * Records that {@code ownerId} depends on this blob.
     *
     * <p>References are what keep a blob alive; an unreferenced blob is eligible for
     * collection once its grace period expires. Referencing is separate from
     * {@link #put} because one set of bytes legitimately has several owners — the same
     * converted PDF is both a case's bundle and a derivation's result.
     */
    void reference(String sha256, BlobOwner ownerKind, String ownerId, String role);

    /** Drops every reference held by one owner. Does not delete blobs. */
    void releaseAll(BlobOwner ownerKind, String ownerId);
}
