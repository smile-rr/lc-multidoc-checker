package com.lc.v2.checker.infra.storage;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;

/**
 * Tracks whether MinIO answered at startup (or on the last S3 call).
 * When false, {@link S3FileStore} skips network I/O and serves from the
 * in-process {@link PdfBytesCache} only — avoids ~8s connect timeouts per
 * PDF on Mac local dev when Ubuntu MinIO is unreachable.
 */
@Component
public class MinioReachability {

    private final AtomicBoolean reachable = new AtomicBoolean(true);

    public boolean isReachable() {
        return reachable.get();
    }

    public void markReachable() {
        reachable.set(true);
    }

    public void markUnreachable() {
        reachable.set(false);
    }
}
