package com.tb.helix.infra.cache;

import java.util.Optional;

/**
 * Durable L3 for derivation answers.
 *
 * <p>Two backends, one port — chosen by {@code helix.cache.l3.storage}:
 * <ul>
 *   <li>{@code DISK} — JSON files under {@code helix.cache.l3.disk-root} (local default)</li>
 *   <li>{@code DB} — Postgres {@code helix_infra.derivation} (system / shared testing)</li>
 * </ul>
 *
 * <p>Byte-valued answers still live in the blob store; this layer only holds structured
 * results and an optional pointer ({@code result_blob_sha}).
 */
public interface DerivationStore {

    /** One stored answer, before it is decoded to the caller's type. */
    record Row(String resultJson, String blobSha, int hitCount) {
    }

    boolean enabled();

    Optional<Row> lookup(String cacheKey);

    void store(DerivationKey key, Object value, String blobSha,
               String rawResponse, DerivationCache.Usage usage);

    <T> Optional<T> decode(String resultJson, Class<T> type);

    int purgeExpired();
}
