package com.tb.helix.infra.blob;

import com.tb.helix.infra.Sha256;
import com.tb.helix.infra.config.BlobProperties;
import com.tb.helix.infra.error.DocumentException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Optional;

/**
 * Blob storage in Postgres — the server tier.
 *
 * <p>Chosen over disk on the server because instances share it, a redeploy cannot take the
 * bytes with it, and there is no volume to provision or back up separately. On a laptop
 * {@link DiskBlobStore} is better: you can open the files.
 *
 * <p>Same content-addressing, same catalogue, same port. Only where the bytes land differs,
 * which is the whole reason {@link BlobStore} is an interface — this class exists and
 * nothing outside this package knows.
 *
 * <p><b>The size caveat, stated plainly.</b> A {@code bytea} read materialises whole on the
 * heap: streaming an 80 MB bundle to a viewer costs 80 MB, where the disk tier streams it.
 * Fine at the volumes here, and it is the reason the S3 tier is on the roadmap rather than
 * theoretical.
 */
@Component
@ConditionalOnProperty(name = "helix.blob.tier", havingValue = "DB")
public class DbBlobStore implements BlobStore {

    private static final Logger log = LoggerFactory.getLogger(DbBlobStore.class);
    private static final String TIER = "DB";

    private final JdbcTemplate jdbc;
    private final BlobCatalog catalog;

    public DbBlobStore(JdbcTemplate jdbc, BlobCatalog catalog, BlobProperties props) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        log.info("Blob store: Postgres (helix_core.blob_content), tier={}", props.tier());
    }

    @Override
    public BlobRef put(byte[] content, String mediaType, String originalName) {
        String sha = Sha256.of(content);
        BlobRef ref = new BlobRef(sha, content.length, mediaType, null, originalName);

        // The catalogue row first, because blob_content references it. Both statements are
        // idempotent, so re-presenting the same bundle writes nothing new.
        catalog.register(ref, TIER, "db://" + sha);
        jdbc.update("""
                INSERT INTO helix_core.blob_content (sha256, content) VALUES (?, ?)
                ON CONFLICT (sha256) DO NOTHING
                """, sha, content);

        return catalog.find(sha).orElse(ref);
    }

    @Override
    public Optional<byte[]> get(String sha256) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    "SELECT content FROM helix_core.blob_content WHERE sha256 = ?", byte[].class, sha256));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (RuntimeException e) {
            throw new DocumentException("Could not read blob " + sha256.substring(0, 12),
                    "blob_read_failed", e);
        }
    }

    @Override
    public Optional<InputStream> open(String sha256) {
        // No streaming win here — bytea arrives whole regardless. Wrapping keeps the port
        // honest rather than pretending this tier streams when it does not.
        return get(sha256).map(ByteArrayInputStream::new);
    }

    @Override
    public boolean exists(String sha256) {
        Boolean found = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM helix_core.blob_content WHERE sha256 = ?)",
                Boolean.class, sha256);
        return Boolean.TRUE.equals(found);
    }

    @Override
    public void recordPageCount(String sha256, int pageCount) {
        catalog.setPageCount(sha256, pageCount);
    }

    @Override
    public void reference(String sha256, BlobOwner ownerKind, String ownerId, String role) {
        catalog.reference(sha256, ownerKind, ownerId, role);
    }

    @Override
    public void releaseAll(BlobOwner ownerKind, String ownerId) {
        catalog.releaseAll(ownerKind, ownerId);
    }
}
