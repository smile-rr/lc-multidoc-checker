package com.tb.helix.infra.cache;

import com.tb.helix.infra.config.CacheProperties;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * L3 — the durable answer, in {@code helix_infra.derivation}.
 *
 * <p>Postgres rather than the filesystem for structured results, because everything this
 * needs is already there: TTL as a column and a sweep, hit counting, indexed lookup by
 * {@code (op, input_sha)}, and transactional consistency with the case rows that cite it.
 *
 * <p>Byte-valued answers — a converted PDF, a page render — go the other way: their bytes
 * live in the blob store and {@code result_blob_sha} points at them. A megabyte in a row
 * is a row nobody wants to select.
 *
 * <p>Every failure here is swallowed and logged as a miss. The cache is an optimisation
 * and must never be able to fail an examination.
 */
@Component
@ConditionalOnProperty(name = "helix.cache.l3.storage", havingValue = "DB")
public class PgDerivationStore implements DerivationStore {

    private static final Logger log = LoggerFactory.getLogger(PgDerivationStore.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final CacheProperties.L3 cfg;

    public PgDerivationStore(JdbcTemplate jdbc, ObjectMapper json, CacheProperties props) {
        this.jdbc = jdbc;
        this.json = json;
        this.cfg = props.l3();
        log.info("L3 derivation store: Postgres (helix_infra.derivation)");
    }

    /**
     * The model that actually charged, falling back to the key's role placeholder.
     *
     * <p>The key names a role — {@code role:extract} — because it is built before a slot is
     * chosen. Storing that as the model meant a cache hit could never be priced: no family
     * matches it, so the row resolved to no money at all.
     */
    private static String modelOf(DerivationKey key, DerivationCache.Usage usage) {
        return usage != null && usage.modelId() != null ? usage.modelId() : key.modelId();
    }

    @Override
    public boolean enabled() {
        return cfg.enabled();
    }

    @Override
    public Optional<Row> lookup(String cacheKey) {
        if (!cfg.enabled()) return Optional.empty();
        try {
            return jdbc.query("""
                    UPDATE helix_infra.derivation
                       SET hit_count = hit_count + 1, last_hit_at = NOW()
                     WHERE cache_key = ?
                       AND (expires_at IS NULL OR expires_at > NOW())
                    RETURNING result::text, result_blob_sha, hit_count,
                              model_id, prompt_tokens, completion_tokens
                    """,
                    (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getInt(3),
                            rs.getString(4), (Integer) rs.getObject(5), (Integer) rs.getObject(6)),
                    cacheKey).stream().findFirst();
        } catch (RuntimeException e) {
            log.warn("L3 lookup failed, treating as miss: {}", e.toString());
            return Optional.empty();
        }
    }

    @Override
    public void store(DerivationKey key, Object value, String blobSha,
                      String rawResponse, DerivationCache.Usage usage) {
        if (!cfg.enabled()) return;
        try {
            Duration ttl = cfg.ttlFor(key.op());
            // A zero TTL means never expire — correct for deterministic ops, where the
            // answer cannot go stale because nothing about the question can change.
            Long ttlSeconds = ttl == null || ttl.isZero() || ttl.isNegative() ? null : ttl.toSeconds();

            jdbc.update("""
                    INSERT INTO helix_infra.derivation
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
                    key.promptSha(), modelOf(key, usage), key.providerUrl(),
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

    @Override
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

    @Override
    public int purgeExpired() {
        try {
            return jdbc.update("DELETE FROM helix_infra.derivation WHERE expires_at IS NOT NULL AND expires_at <= NOW()");
        } catch (RuntimeException e) {
            log.warn("L3 purge failed: {}", e.toString());
            return 0;
        }
    }
}
