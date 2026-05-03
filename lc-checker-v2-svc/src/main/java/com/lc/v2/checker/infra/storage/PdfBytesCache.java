package com.lc.v2.checker.infra.storage;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * In-process hot cache of PDF bytes keyed by docId.
 *
 * <p>Populated by {@link S3FileStore} on every PUT (success or failure) and
 * on every successful MinIO GET. The controller always checks this cache first
 * before hitting MinIO, so a running JVM never needs a MinIO round-trip for
 * documents already seen during this session.
 *
 * <p>Documents whose PDFs were only persisted to MinIO (e.g. after JVM restart)
 * are loaded from MinIO on first access and cached here for subsequent reads.
 */
@Component
public class PdfBytesCache {

    private final Map<String, byte[]> cache = new ConcurrentHashMap<>();

    public void put(String docId, byte[] bytes) {
        if (docId == null || bytes == null) return;
        cache.put(docId, bytes);
    }

    public byte[] get(String docId) {
        return cache.get(docId);
    }

    public boolean contains(String docId) {
        return cache.containsKey(docId);
    }

    public void evictSession(java.util.Collection<String> docIds) {
        for (String id : docIds) cache.remove(id);
    }

    public int size() { return cache.size(); }
}
