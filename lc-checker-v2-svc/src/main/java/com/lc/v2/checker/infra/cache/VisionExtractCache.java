package com.lc.v2.checker.infra.cache;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * JDBC repo for {@code lc_v2.vision_extract_cache}. Stores per-slot raw VLM responses
 * keyed by the deterministic input hash composed in {@link CacheKey}.
 *
 * <p>Self-heals on startup: runs idempotent CREATE TABLE / ADD COLUMN / CREATE INDEX
 * so a fresh DB or one missing the latest column boots up correctly without an
 * out-of-band migration step.
 */
@Component
public class VisionExtractCache {

    private static final Logger log = LoggerFactory.getLogger(VisionExtractCache.class);

    private final JdbcTemplate jdbc;

    /** TTL in days for new cache entries. {@code <= 0} means never expire. */
    @Value("${vision.cache.ttl-days:90}")
    private int ttlDays;

    public VisionExtractCache(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PostConstruct
    public void ensureSchema() {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS lc_v2.vision_extract_cache (
                      cache_key         TEXT PRIMARY KEY,
                      pdf_sha256        TEXT NOT NULL,
                      prompt_sha256     TEXT NOT NULL,
                      model             TEXT NOT NULL,
                      base_url          TEXT NOT NULL,
                      render_dpi        INT  NOT NULL,
                      max_pages         INT  NOT NULL,
                      max_long_edge     INT,
                      request_shape_v   INT  NOT NULL,
                      raw_response      JSONB NOT NULL,
                      parsed_envelope   JSONB NOT NULL,
                      off_schema_raw    JSONB,
                      prompt_tokens     INT,
                      completion_tokens INT,
                      total_tokens      INT,
                      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
                      expires_at        TIMESTAMPTZ,
                      hit_count         INT NOT NULL DEFAULT 0,
                      last_hit_at       TIMESTAMPTZ
                    )
                    """);
            jdbc.execute("""
                    ALTER TABLE lc_v2.vision_extract_cache
                      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
                    """);
            jdbc.execute("""
                    CREATE INDEX IF NOT EXISTS ix_vec_pdf_model
                      ON lc_v2.vision_extract_cache (pdf_sha256, model)
                    """);
            jdbc.execute("""
                    CREATE INDEX IF NOT EXISTS ix_vec_expires_at
                      ON lc_v2.vision_extract_cache (expires_at) WHERE expires_at IS NOT NULL
                    """);
            log.info("[VisionCache] schema ready (ttl-days={})", ttlDays);
        } catch (Exception e) {
            log.error("[VisionCache] schema init failed: {}", e.getMessage(), e);
        }
    }

    public record Hit(String rawResponse, Integer promptTokens, Integer completionTokens, Integer totalTokens) {}

    public Hit lookup(String cacheKey) {
        try {
            return jdbc.queryForObject("""
                    SELECT raw_response::text, prompt_tokens, completion_tokens, total_tokens
                    FROM   lc_v2.vision_extract_cache
                    WHERE  cache_key = ?
                      AND  (expires_at IS NULL OR expires_at > now())
                    """,
                    (rs, i) -> new Hit(
                            rs.getString(1),
                            (Integer) rs.getObject(2),
                            (Integer) rs.getObject(3),
                            (Integer) rs.getObject(4)),
                    cacheKey);
        } catch (EmptyResultDataAccessException e) {
            return null;
        } catch (Exception e) {
            log.warn("[VisionCache] lookup failed for key={}: {}", abbrev(cacheKey), e.getMessage());
            return null;
        }
    }

    public void put(String cacheKey,
                    String pdfSha256, String promptSha256,
                    String model, String baseUrl,
                    int renderDpi, int maxPages, Integer maxLongEdge,
                    int requestShapeVersion,
                    String rawResponseJson, String parsedEnvelopeJson, String offSchemaJson,
                    Integer promptTokens, Integer completionTokens, Integer totalTokens) {
        try {
            String expiresExpr = ttlDays > 0
                    ? "now() + (? || ' days')::interval"
                    : "NULL";
            String sql = """
                    INSERT INTO lc_v2.vision_extract_cache
                      (cache_key, pdf_sha256, prompt_sha256, model, base_url,
                       render_dpi, max_pages, max_long_edge, request_shape_v,
                       raw_response, parsed_envelope, off_schema_raw,
                       prompt_tokens, completion_tokens, total_tokens,
                       created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?,
                            NOW(), %s)
                    ON CONFLICT (cache_key) DO UPDATE SET
                      raw_response    = EXCLUDED.raw_response,
                      parsed_envelope = EXCLUDED.parsed_envelope,
                      off_schema_raw  = EXCLUDED.off_schema_raw,
                      prompt_tokens   = EXCLUDED.prompt_tokens,
                      completion_tokens = EXCLUDED.completion_tokens,
                      total_tokens    = EXCLUDED.total_tokens,
                      expires_at      = EXCLUDED.expires_at
                    """.formatted(expiresExpr);

            if (ttlDays > 0) {
                jdbc.update(sql,
                        cacheKey, pdfSha256, promptSha256, model, baseUrl,
                        renderDpi, maxPages, maxLongEdge, requestShapeVersion,
                        rawResponseJson, parsedEnvelopeJson, offSchemaJson,
                        promptTokens, completionTokens, totalTokens,
                        String.valueOf(ttlDays));
            } else {
                jdbc.update(sql,
                        cacheKey, pdfSha256, promptSha256, model, baseUrl,
                        renderDpi, maxPages, maxLongEdge, requestShapeVersion,
                        rawResponseJson, parsedEnvelopeJson, offSchemaJson,
                        promptTokens, completionTokens, totalTokens);
            }
        } catch (Exception e) {
            log.warn("[VisionCache] put failed for key={}: {}", abbrev(cacheKey), e.getMessage());
        }
    }

    public void incrementHit(String cacheKey) {
        try {
            jdbc.update("""
                    UPDATE lc_v2.vision_extract_cache
                    SET    hit_count = hit_count + 1,
                           last_hit_at = NOW()
                    WHERE  cache_key = ?
                    """, cacheKey);
        } catch (Exception e) {
            log.debug("[VisionCache] incrementHit skipped: {}", e.getMessage());
        }
    }

    /** Bulk delete of expired rows. Safe to call from a scheduler. Returns rows removed. */
    public int purgeExpired() {
        try {
            return jdbc.update("""
                    DELETE FROM lc_v2.vision_extract_cache
                    WHERE  expires_at IS NOT NULL AND expires_at <= now()
                    """);
        } catch (Exception e) {
            log.warn("[VisionCache] purgeExpired failed: {}", e.getMessage());
            return 0;
        }
    }

    private static String abbrev(String key) {
        return key == null ? "null" : (key.length() > 12 ? key.substring(0, 12) : key);
    }
}
