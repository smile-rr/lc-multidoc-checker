package com.tb.helix.infra.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.core.cache.DerivationCache;
import com.tb.helix.core.cache.DerivationKey;
import com.tb.helix.infra.config.CacheProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * L3 — the durable answer, in {@code helix_core.derivation}.
 *
 * <p>Postgres rather than the filesystem for structured results, because everything this
 * needs is already there: TTL as a column and a sweep, hit counting, indexed lookup by
 * {@code (op, input_sha)}, and transactional consistency with the case rows that cite it.
 * On disk each of those is something to hand-build, and the GC would be the third one
 * written in this codebase.
 *
 * <p>Byte-valued answers — a converted PDF, a page render — go the other way: their bytes
 * live in the blob store and {@code result_blob_sha} points at them. A megabyte in a row
 * is a row nobody wants to select.
 *
 * <p>Every failure here is swallowed and logged as a miss. The cache is an optimisation
 * and must never be able to fail an examination.
 */
@Component
public class PgDerivationStore {

    private static final Logger log = LoggerFactory.getLogger(PgDerivationStore.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final CacheProperties.L3 cfg;

    public PgDerivationStore(JdbcTemplate jdbc, ObjectMapper json, CacheProperties props) {
        this.jdbc = jdbc;
        this.json = json;
        this.cfg = props.l3();
    }

    public boolean enabled() {
        return cfg.enabled();
    }

    /** One stored answer, before it is decoded to the caller's type. */
    public record Row(String resultJson, String blobSha, int hitCount) {
    }

    /**
     * Looks up an answer and counts the hit.
     *
     * <p>The hit count is bumped in the same statement that reads, so concurrent readers
     * cannot lose an increment — and it is what tells you, later, which cached answers are
     * actually earning their storage.
     */
    public Optional<Row> lookup(String cacheKey) {
        if (!cfg.enabled()) return Optional.empty();
        try {
            return jdbc.query("""
                    UPDATE helix_core.derivation
                       SET hit_count = hit_count + 1, last_hit_at = NOW()
                     WHERE cache_key = ?
                       AND (expires_at IS NULL OR expires_at > NOW())
                    RETURNING result::text, result_blob_sha, hit_count
                    """,
                    (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getInt(3)),
                    cacheKey).stream().findFirst();
        } catch (RuntimeException e) {
            log.warn("L3 lookup failed, treating as miss: {}", e.toString());
            return Optional.empty();
        }
    }

    /** Stores an answer. Overwrites any existing entry for the same key. */
    public void store(DerivationKey key, Object value, String blobSha,
                      String rawResponse, DerivationCache.Usage usage) {
        if (!cfg.enabled()) return;
        try {
            Duration ttl = cfg.ttlFor(key.op());
            // A zero TTL means never expire — correct for deterministic ops, where the
            // answer cannot go stale because nothing about the question can change.
            Long ttlSeconds = ttl == null || ttl.isZero() || ttl.isNegative() ? null : ttl.toSeconds();

            jdbc.update("""
                    INSERT INTO helix_core.derivation
                        (cache_key, op, op_version, input_sha, input_scope, prompt_sha,
                         model_id, provider_url, params, result, result_blob_sha, raw_response,
                         prompt_tokens, completion_tokens, total_tokens, latency_ms, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?, ?, ?, ?,
                            CASE WHEN ?::bigint IS NULL THEN NULL
                                 ELSE NOW() + (?::bigint || ' seconds')::interval END)
                    ON CONFLICT (cache_key) DO UPDATE SET
                        result          = EXCLUDED.result,
                        result_blob_sha = EXCLUDED.result_blob_sha,
                        raw_response    = EXCLUDED.raw_response,
                        expires_at      = EXCLUDED.expires_at,
                        created_at      = NOW()
                    """,
                    key.hash(), key.op(), key.opVersion(), key.inputSha(), key.inputScope(),
                    key.promptSha(), key.modelId(), key.providerUrl(),
                    json.writeValueAsString(key.params()),
                    value == null ? null : json.writeValueAsString(value),
                    blobSha,
                    rawResponse,
                    usage == null ? null : usage.promptTokens(),
                    usage == null ? null : usage.completionTokens(),
                    usage == null ? null : usage.totalTokens(),
                    usage == null ? null : usage.latencyMs(),
                    ttlSeconds, ttlSeconds);
        } catch (Exception e) {
            log.warn("L3 write failed for {} ({}), continuing: {}", key.op(), key.hash(), e.toString());
        }
    }

    public <T> Optional<T> decode(String resultJson, Class<T> type) {
        if (resultJson == null) return Optional.empty();
        try {
            return Optional.ofNullable(json.readValue(resultJson, type));
        } catch (Exception e) {
            // A stored answer that no longer parses means the shape changed without its
            // op_version being bumped. A miss recomputes it; failing would strand every
            // case that touches it.
            log.warn("L3 entry no longer decodes to {} — treating as miss. Bump the op version. {}",
                    type.getSimpleName(), e.toString());
            return Optional.empty();
        }
    }

    public int purgeExpired() {
        try {
            return jdbc.update("DELETE FROM helix_core.derivation WHERE expires_at IS NOT NULL AND expires_at <= NOW()");
        } catch (RuntimeException e) {
            log.warn("L3 purge failed: {}", e.toString());
            return 0;
        }
    }
}
