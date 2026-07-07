package com.lc.v2.checker.infra.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import com.lc.v2.checker.infra.config.StorageProperties;

/**
 * Verifies the configured MinIO bucket exists and pre-warms the connection on startup.
 * Non-blocking — if MinIO is unreachable, sessions run with in-process cache only.
 */
@Component
public class MinioBucketBootstrap {

    private static final Logger log = LoggerFactory.getLogger(MinioBucketBootstrap.class);

    private final S3Client s3;
    private final StorageProperties cfg;
    private final MinioReachability reachability;

    public MinioBucketBootstrap(S3Client s3, StorageProperties cfg,
                                MinioReachability reachability) {
        this.s3 = s3;
        this.cfg = cfg;
        this.reachability = reachability;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ensureBucket() {
        if (!cfg.enabled()) {
            log.info("MinIO not required (STORAGE_MINIO_REQUIRED=false) — memory-only PDF cache");
            reachability.markUnreachable();
            return;
        }
        try {
            s3.headBucket(HeadBucketRequest.builder().bucket(cfg.bucket()).build());
            log.info("MinIO bucket '{}' exists at {} — store enabled", cfg.bucket(), cfg.endpoint());
            reachability.markReachable();
        } catch (NoSuchBucketException e) {
            createBucket();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                createBucket();
            } else {
                log.warn("MinIO headBucket failed (status={}): {} — sessions will run memory-only",
                        e.statusCode(), e.getMessage());
                reachability.markUnreachable();
                return;
            }
        } catch (RuntimeException e) {
            log.warn("MinIO unreachable at {}: {} ({}) — sessions will run memory-only",
                    cfg.endpoint(), e.getMessage(), e.getClass().getSimpleName());
            reachability.markUnreachable();
            return;
        }
        preWarmConnection();
    }

    private void preWarmConnection() {
        long t0 = System.currentTimeMillis();
        try {
            s3.listObjectsV2(ListObjectsV2Request.builder()
                    .bucket(cfg.bucket())
                    .maxKeys(1)
                    .build());
            log.info("MinIO connection pre-warmed ({}ms)", System.currentTimeMillis() - t0);
        } catch (S3Exception e) {
            if (e.statusCode() != 200) {
                log.warn("MinIO pre-warm returned status {}: {}", e.statusCode(), e.getMessage());
            }
        } catch (RuntimeException e) {
            log.warn("MinIO pre-warm failed: {} ({}) — first request may be slow",
                    e.getMessage(), e.getClass().getSimpleName());
        }
    }

    private void createBucket() {
        try {
            s3.createBucket(CreateBucketRequest.builder().bucket(cfg.bucket()).build());
            log.info("MinIO bucket '{}' created at {}", cfg.bucket(), cfg.endpoint());
            preWarmConnection();
        } catch (RuntimeException e) {
            log.warn("MinIO createBucket('{}') failed: {} — sessions will run memory-only",
                    cfg.bucket(), e.getMessage());
            reachability.markUnreachable();
        }
    }
}
