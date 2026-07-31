package com.tb.helix.infra.blob;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * The index over the blob store.
 *
 * <p>Bytes live on disk; this table says what they are and who needs them. Keeping the
 * catalogue in Postgres rather than inferring it from the filesystem is what lets the
 * disk layout be pure content-addressing — no case folders, no doc-type folders, no
 * naming scheme to migrate when the questions change.
 */
@Component
public class BlobCatalog {

    private final JdbcTemplate jdbc;

    public BlobCatalog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Records a blob, or refreshes {@code last_seen_at} if it is already known.
     *
     * <p>The ON CONFLICT branch is the dedup: presenting the same bundle twice writes one
     * row and touches it, rather than failing or duplicating. {@code last_seen_at} is what
     * distinguishes "stored once in 2024 and never referenced again" from "arrives weekly".
     */
    public void register(BlobRef ref, String storageTier, String storageKey) {
        jdbc.update("""
                INSERT INTO helix_infra.blob
                    (sha256, byte_size, media_type, storage_tier, storage_key, original_filename, page_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (sha256) DO UPDATE SET
                    last_seen_at = NOW(),
                    -- Fill in a page count learnt later; never overwrite a known one with null.
                    page_count   = COALESCE(helix_infra.blob.page_count, EXCLUDED.page_count)
                """,
                ref.sha256(), ref.byteSize(), ref.mediaType(), storageTier, storageKey,
                ref.originalName(), ref.pageCount());
    }

    public Optional<BlobRef> find(String sha256) {
        return jdbc.query("""
                SELECT sha256, byte_size, media_type, page_count, original_filename
                  FROM helix_infra.blob WHERE sha256 = ?
                """,
                (rs, i) -> new BlobRef(
                        rs.getString("sha256"),
                        rs.getLong("byte_size"),
                        rs.getString("media_type"),
                        (Integer) rs.getObject("page_count"),
                        rs.getString("original_filename")),
                sha256).stream().findFirst();
    }

    public boolean exists(String sha256) {
        Boolean found = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM helix_infra.blob WHERE sha256 = ?)", Boolean.class, sha256);
        return Boolean.TRUE.equals(found);
    }

    /** Records a page count discovered after storage — a PDF is not opened just to count it. */
    public void setPageCount(String sha256, int pageCount) {
        jdbc.update("UPDATE helix_infra.blob SET page_count = ? WHERE sha256 = ?", pageCount, sha256);
    }

    /**
     * Records that an owner depends on this blob.
     *
     * <p>Idempotent: re-referencing is a no-op rather than a constraint violation, because
     * a stage that reruns should not have to remember whether it already claimed something.
     */
    public void reference(String sha256, BlobOwner ownerKind, String ownerId, String role) {
        jdbc.update("""
                INSERT INTO helix_infra.blob_ref (blob_sha, owner_kind, owner_id, role)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (owner_kind, owner_id, role, blob_sha) DO NOTHING
                """,
                sha256, ownerKind.name(), ownerId, role);
    }

    public void releaseAll(BlobOwner ownerKind, String ownerId) {
        jdbc.update("DELETE FROM helix_infra.blob_ref WHERE owner_kind = ? AND owner_id = ?",
                ownerKind.name(), ownerId);
    }

    /** What one owner holds, by role. */
    public Optional<String> shaFor(BlobOwner ownerKind, String ownerId, String role) {
        return jdbc.queryForList("""
                SELECT blob_sha FROM helix_infra.blob_ref
                 WHERE owner_kind = ? AND owner_id = ? AND role = ?
                """, String.class, ownerKind.name(), ownerId, role)
                .stream().findFirst();
    }

    /**
     * Blobs nothing references, old enough to collect.
     *
     * <p>Returns candidates rather than deleting: the caller removes the bytes first and
     * the row second, so a crash between the two leaves an orphaned row (harmless, found
     * again next sweep) rather than a row pointing at bytes that are gone.
     */
    public List<String> orphans(java.time.Duration grace, int limit) {
        return jdbc.queryForList("""
                SELECT b.sha256 FROM helix_infra.blob b
                 WHERE NOT EXISTS (SELECT 1 FROM helix_infra.blob_ref r WHERE r.blob_sha = b.sha256)
                   AND b.last_seen_at < NOW() - (? || ' seconds')::interval
                 ORDER BY b.last_seen_at
                 LIMIT ?
                """, String.class, grace.toSeconds(), limit);
    }

    public void forget(String sha256) {
        jdbc.update("DELETE FROM helix_infra.blob WHERE sha256 = ?", sha256);
    }
}
