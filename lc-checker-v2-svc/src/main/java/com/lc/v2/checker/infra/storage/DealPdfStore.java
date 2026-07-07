package com.lc.v2.checker.infra.storage;

import com.lc.v2.checker.infra.config.StorageProperties;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Session-scoped merged deal PDF for Segmentation bundle preview.
 * Hot cache via {@link PdfBytesCache}; optional MinIO persistence when enabled.
 */
@Component
public class DealPdfStore {

    private static final Logger log = LoggerFactory.getLogger(DealPdfStore.class);
    private static final String CACHE_PREFIX = "deal-pdf:";
    private static final String S3_SUBDIR = "deal/";
    private static final String CONTENT_TYPE = "application/pdf";

    private final S3Client s3;
    private final StorageProperties cfg;
    private final PdfBytesCache cache;
    private final MinioReachability reachability;

    public DealPdfStore(S3Client s3, StorageProperties cfg, PdfBytesCache cache,
                        MinioReachability reachability) {
        this.s3 = s3;
        this.cfg = cfg;
        this.cache = cache;
        this.reachability = reachability;
    }

    public boolean put(String sessionId, byte[] pdfBytes) {
        if (sessionId == null || pdfBytes == null || pdfBytes.length == 0) return false;
        String cacheKey = cacheKey(sessionId);
        cache.put(cacheKey, pdfBytes);

        if (!cfg.enabled() || !reachability.isReachable()) {
            return true;
        }

        String key = objectKey(sessionId);
        try {
            s3.putObject(PutObjectRequest.builder()
                            .bucket(cfg.bucket())
                            .key(key)
                            .contentType(CONTENT_TYPE)
                            .build(),
                    RequestBody.fromBytes(pdfBytes));
            log.info("Deal PDF S3 PUT ok: session={} bytes={}", sessionId, pdfBytes.length);
            reachability.markReachable();
            return true;
        } catch (SdkClientException e) {
            reachability.markUnreachable();
            log.warn("Deal PDF S3 PUT failed for session={}: {} — in-process cache only",
                    sessionId, e.getMessage());
            return true;
        }
    }

    public Optional<byte[]> get(String sessionId) {
        if (sessionId == null) return Optional.empty();
        byte[] cached = cache.get(cacheKey(sessionId));
        if (cached != null) return Optional.of(cached);

        if (!cfg.enabled() || !reachability.isReachable()) {
            return Optional.empty();
        }

        String key = objectKey(sessionId);
        try {
            ResponseBytes<GetObjectResponse> rb = s3.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(cfg.bucket()).key(key).build());
            byte[] bytes = rb.asByteArray();
            cache.put(cacheKey(sessionId), bytes);
            reachability.markReachable();
            return Optional.of(bytes);
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (SdkClientException e) {
            reachability.markUnreachable();
            log.warn("Deal PDF S3 GET failed for session={}: {}", sessionId, e.getMessage());
            return Optional.empty();
        }
    }

    public boolean isAvailable(String sessionId) {
        return get(sessionId).isPresent();
    }

    private static String cacheKey(String sessionId) {
        return CACHE_PREFIX + sessionId;
    }

    private String objectKey(String sessionId) {
        return cfg.pathPrefix() + S3_SUBDIR + sessionId + ".pdf";
    }
}
