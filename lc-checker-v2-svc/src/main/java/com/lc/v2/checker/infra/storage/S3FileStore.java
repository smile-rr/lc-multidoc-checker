package com.lc.v2.checker.infra.storage;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.exception.SdkServiceException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import com.lc.v2.checker.infra.config.StorageProperties;

/**
 * MinIO / S3-compatible object store for PDF persistence.
 * Content-addressed by docId: the object key is simply {@code v2/<docId>.pdf}.
 *
 * <p>Hot-cache fallback: every successful PUT populates the local
 * {@link PdfBytesCache} so the controller can retrieve bytes without hitting
 * MinIO on subsequent reads. On cache miss the controller calls {@link #get}
 * which falls back to MinIO.
 *
 * <p>Retry with exponential backoff on transient failures. After exhausting
 * retries, throws {@link MinioAccessException}.
 */
public class S3FileStore {

    private static final Logger log = LoggerFactory.getLogger(S3FileStore.class);

    private static final String OBJECT_PREFIX = "pdf/";
    private static final String CONTENT_TYPE  = "application/pdf";

    private static final int RETRY_INIT_MS  = 500;
    private static final int RETRY_MAX_MS  = 4_000;
    private static final int RETRY_MAX_ATTEMPTS = 3;

    private final S3Client s3;
    private final StorageProperties cfg;
    private final PdfBytesCache cache;

    public S3FileStore(S3Client s3, StorageProperties cfg, PdfBytesCache cache) {
        this.s3 = s3;
        this.cfg = cfg;
        this.cache = cache;
        log.info("S3FileStore wired: endpoint={} bucket={} prefix={}",
                cfg.endpoint(), cfg.bucket(), cfg.pathPrefix());
    }

    public boolean enabled() { return cfg.enabled(); }

    /**
     * Stores PDF bytes for a document, overwriting any existing object.
     * Returns true on success. Populates the hot cache on success or failure.
     */
    public boolean put(String docId, byte[] bytes) {
        String key = objectKey(docId);

        // Always populate hot cache so the controller always has a hit.
        cache.put(docId, bytes);

        if (!cfg.enabled()) {
            log.debug("S3 disabled — PDF cached in-process only");
            return true;
        }

        try {
            // Deduplication probe: if the object already exists, skip PUT.
            try {
                s3.headObject(HeadObjectRequest.builder()
                        .bucket(cfg.bucket())
                        .key(key)
                        .build());
                log.debug("S3 dedup hit: {}", key);
                return true;
            } catch (NoSuchKeyException ignored) {
                // fall through to PUT
            }

            s3.putObject(PutObjectRequest.builder()
                            .bucket(cfg.bucket())
                            .key(key)
                            .contentType(CONTENT_TYPE)
                            .build(),
                    RequestBody.fromBytes(bytes));
            log.info("S3 PUT ok: bucket={} key={} bytes={}", cfg.bucket(), key, bytes.length);
            return true;

        } catch (SdkServiceException e) {
            log.warn("S3 PUT {} failed ({}): {} — serving from hot cache",
                    key, e.statusCode(), e.getMessage());
            return true;
        } catch (SdkClientException e) {
            log.warn("S3 PUT {} unreachable: {} — serving from hot cache", key, e.getMessage());
            return true;
        }
    }

    /**
     * Returns PDF bytes from hot cache first, then from MinIO on miss.
     * Populates the hot cache on a successful MinIO read.
     * Returns empty if the object is genuinely not found in either layer.
     */
    public Optional<byte[]> get(String docId) {
        // Hot cache first.
        byte[] cached = cache.get(docId);
        if (cached != null) {
            log.debug("S3 hot-cache hit: docId={}", docId);
            return Optional.of(cached);
        }

        if (!cfg.enabled()) {
            log.debug("S3 disabled, no cache entry: docId={}", docId);
            return Optional.empty();
        }

        String key = objectKey(docId);
        int attempt = 0;
        SdkClientException lastFailure = null;

        while (attempt < RETRY_MAX_ATTEMPTS) {
            attempt++;
            try {
                ResponseBytes<GetObjectResponse> rb = s3.getObjectAsBytes(
                        GetObjectRequest.builder().bucket(cfg.bucket()).key(key).build());
                byte[] bytes = rb.asByteArray();
                // Populate hot cache so the next read is a cache hit.
                cache.put(docId, bytes);
                log.info("S3 GET ok: bucket={} key={} bytes={} attempts={}",
                        cfg.bucket(), key, bytes.length, attempt);
                return Optional.of(bytes);

            } catch (NoSuchKeyException e) {
                log.debug("S3 GET miss: {}", key);
                return Optional.empty();

            } catch (SdkServiceException e) {
                if (e.statusCode() >= 500 && attempt < RETRY_MAX_ATTEMPTS) {
                    log.warn("S3 GET {} received {} — retrying ({}/{})",
                            key, e.statusCode(), attempt, RETRY_MAX_ATTEMPTS);
                    sleep(calcDelayMs(attempt));
                    continue;
                }
                log.warn("S3 GET {} failed ({}): {}", key, e.statusCode(), e.getMessage());
                throw new MinioAccessException(key, e);

            } catch (SdkClientException e) {
                lastFailure = e;
                if (attempt < RETRY_MAX_ATTEMPTS) {
                    log.warn("S3 GET {} attempt {}/{} failed: {} — retrying",
                            key, attempt, RETRY_MAX_ATTEMPTS, e.getMessage());
                    sleep(calcDelayMs(attempt));
                    continue;
                }
                log.error("S3 GET {} unreachable after {} attempts: {}",
                        key, RETRY_MAX_ATTEMPTS, e.getMessage());
                throw new MinioAccessException(key, e);
            }
        }
        throw new MinioAccessException(key, lastFailure);
    }

    private String objectKey(String docId) {
        return cfg.pathPrefix() + OBJECT_PREFIX + docId + ".pdf";
    }

    private int calcDelayMs(int attempt) {
        return Math.min(RETRY_INIT_MS * (int) Math.pow(2, attempt - 1), RETRY_MAX_MS);
    }

    private static void sleep(int ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    /** Thrown when MinIO is reachable but the read fails transiently after retries. */
    public static class MinioAccessException extends RuntimeException {
        private final String key;
        public MinioAccessException(String key, Throwable cause) {
            super("MinIO read failed for '" + key + "': " + cause.getMessage(), cause);
            this.key = key;
        }
        public String key() { return key; }
    }
}
