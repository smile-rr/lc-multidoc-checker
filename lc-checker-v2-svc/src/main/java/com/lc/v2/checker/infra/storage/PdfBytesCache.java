package com.lc.v2.checker.infra.storage;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * In-process cache of uploaded PDF bytes keyed by docId.
 *
 * The v2 POC does not yet persist PDFs to MinIO; the bytes captured at intake
 * stay in memory for the lifetime of the JVM so the Parse-stage UI can stream
 * them via {@code GET /sessions/{id}/documents/{docId}/pdf}.
 *
 * Future: replace with MinIO content-addressed storage (see v1 MinioFileStore
 * pattern). The serving controller would then fall back to MinIO on cache miss.
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
