package com.tb.helix.infra.blob;

import com.tb.helix.core.blob.BlobOwner;
import com.tb.helix.core.blob.BlobRef;
import com.tb.helix.core.blob.BlobStore;
import com.tb.helix.core.cache.DerivationKey;
import com.tb.helix.core.error.DocumentException;
import com.tb.helix.infra.config.BlobProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;

/**
 * Content-addressed blob storage on the local filesystem.
 *
 * <pre>
 *   &lt;root&gt;/cas/&lt;aa&gt;/&lt;bb&gt;/&lt;sha256&gt;      the bytes, immutable, no extension
 *   &lt;root&gt;/tmp/&lt;uuid&gt;                      in flight
 *   &lt;root&gt;/by-case/&lt;caseRef&gt;/&lt;role&gt;-&lt;name&gt;  optional symlink mirror, for humans
 * </pre>
 *
 * <p>Two levels of fanout keeps any one directory under a few thousand entries at ten
 * million blobs, which matters on filesystems whose directory lookup degrades with size.
 *
 * <p><b>No extension on stored files.</b> The media type is a fact about the content and
 * lives in the catalogue; encoding it in the path would make a mis-typed upload
 * permanently mis-named, and would tempt something into trusting the path over the row.
 *
 * <p>Writes go to {@code tmp/} and are atomically renamed into place, so a crash mid-write
 * cannot leave a truncated file at an address that claims to be a complete document — the
 * one corruption that content-addressing would otherwise make invisible.
 */
@Component
@ConditionalOnProperty(name = "helix.blob.tier", havingValue = "DISK", matchIfMissing = true)
public class DiskBlobStore implements BlobStore {

    private static final Logger log = LoggerFactory.getLogger(DiskBlobStore.class);
    private static final String TIER = "DISK";

    private final BlobProperties props;
    private final BlobCatalog catalog;
    private final Path root;

    public DiskBlobStore(BlobProperties props, BlobCatalog catalog) {
        this.props = props;
        this.catalog = catalog;
        this.root = Path.of(props.root()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root.resolve("cas"));
            Files.createDirectories(root.resolve("tmp"));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create blob store at " + root, e);
        }
        log.info("Blob store at {} (linkByCase={})", root, props.linkByCase());
    }

    @Override
    public BlobRef put(byte[] content, String mediaType, String originalName) {
        String sha = DerivationKey.sha256Hex(content);
        Path target = pathFor(sha);
        BlobRef ref = new BlobRef(sha, content.length, mediaType, null, originalName);

        // Already held. Identical bytes are identical bytes — no read, no compare, no
        // rewrite. This is the branch that makes re-presenting a bundle free.
        if (Files.exists(target)) {
            catalog.register(ref, TIER, storageKey(sha));
            return catalog.find(sha).orElse(ref);
        }

        Path tmp = root.resolve("tmp").resolve(UUID.randomUUID().toString());
        try {
            Files.createDirectories(target.getParent());
            Files.write(tmp, content);
            try {
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException | java.nio.file.FileAlreadyExistsException e) {
                // FileAlreadyExists: another thread stored the same content between our
                // check and our move. Their bytes are our bytes, so this is success.
                if (!Files.exists(target)) {
                    Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        } catch (IOException e) {
            throw new DocumentException("Could not store " + originalName + " (" + content.length + " bytes)",
                    "blob_write_failed", e);
        } finally {
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
                // A leftover temp file is swept by GC; failing the upload over it would be absurd.
            }
        }

        catalog.register(ref, TIER, storageKey(sha));
        return ref;
    }

    @Override
    public Optional<byte[]> get(String sha256) {
        Path p = pathFor(sha256);
        if (!Files.exists(p)) return Optional.empty();
        try {
            return Optional.of(Files.readAllBytes(p));
        } catch (IOException e) {
            throw new DocumentException("Could not read blob " + sha256.substring(0, 12), "blob_read_failed", e);
        }
    }

    @Override
    public Optional<InputStream> open(String sha256) {
        Path p = pathFor(sha256);
        if (!Files.exists(p)) return Optional.empty();
        try {
            return Optional.of(Files.newInputStream(p));
        } catch (IOException e) {
            throw new DocumentException("Could not open blob " + sha256.substring(0, 12), "blob_read_failed", e);
        }
    }

    @Override
    public boolean exists(String sha256) {
        // The file, not the catalogue: the catalogue can outlive its bytes after a manual
        // deletion, and callers of exists() are about to read.
        return Files.exists(pathFor(sha256));
    }

    @Override
    public void recordPageCount(String sha256, int pageCount) {
        catalog.setPageCount(sha256, pageCount);
    }

    @Override
    public void reference(String sha256, BlobOwner ownerKind, String ownerId, String role) {
        catalog.reference(sha256, ownerKind, ownerId, role);
        if (props.linkByCase() && ownerKind == BlobOwner.CASE) {
            linkForHumans(sha256, ownerId, role);
        }
    }

    @Override
    public void releaseAll(BlobOwner ownerKind, String ownerId) {
        catalog.releaseAll(ownerKind, ownerId);
    }

    // --- Layout ------------------------------------------------------------

    private String storageKey(String sha) {
        return "cas/" + sha.substring(0, 2) + "/" + sha.substring(2, 4) + "/" + sha;
    }

    private Path pathFor(String sha) {
        if (sha == null || sha.length() != 64) {
            throw new IllegalArgumentException("Not a sha256: " + sha);
        }
        return root.resolve(storageKey(sha));
    }

    /**
     * A symlink mirror so a person can look at what a case holds.
     *
     * <p>Best effort by design. This is a convenience for whoever is debugging at 2am; a
     * filesystem that will not make symlinks must not stop an examination.
     */
    private void linkForHumans(String sha, String caseId, String role) {
        try {
            Path dir = root.resolve("by-case").resolve(caseId);
            Files.createDirectories(dir);
            Path link = dir.resolve(role);
            Files.deleteIfExists(link);
            Files.createSymbolicLink(link, dir.relativize(pathFor(sha)));
        } catch (IOException | UnsupportedOperationException e) {
            log.debug("by-case link skipped for {} {}: {}", caseId, role, e.toString());
        }
    }
}
