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

    /**
     * One stored answer, before it is decoded to the caller's type.
     *
     * <p>Carries what the original call cost as well as what it returned. A cache hit is
     * the one event that knows what was <em>avoided</em>, and it could not say so: the
     * ledger recorded cached calls with a placeholder model and zero tokens, so the single
     * number a cache exists to produce was the one number missing from it.
     */
    record Row(String resultJson, String blobSha, int hitCount,
               String modelId, Integer promptTokens, Integer completionTokens) {
    }

    boolean enabled();

    Optional<Row> lookup(String cacheKey);

    void store(DerivationKey key, Object value, String blobSha,
               String rawResponse, DerivationCache.Usage usage);

    <T> Optional<T> decode(String resultJson, Class<T> type);

    int purgeExpired();
}
