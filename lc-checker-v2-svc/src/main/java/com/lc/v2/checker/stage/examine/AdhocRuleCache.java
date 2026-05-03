package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.lc.v2.checker.domain.rule.Rule;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Two-tier cache for ad-hoc rule proposals: in-memory Caffeine (hot) +
 * lc_v2.adhoc_rule_cache JSONB (cross-process, survives JVM restart).
 *
 * Cache key: {@code sha256(lc_raw_text + "|" + catalog_version)}.
 * Catalog version is configurable via {@code rule.catalog.version} (default 1) and
 * should be bumped manually when catalog rules change so old ad-hoc proposals don't
 * clash with newly-added catalog coverage.
 */
@Component
public class AdhocRuleCache {

    private static final Logger log = LoggerFactory.getLogger(AdhocRuleCache.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String catalogVersion;
    private final Cache<String, List<Rule>> hot = Caffeine.newBuilder()
            .maximumSize(256)
            .expireAfterWrite(2, TimeUnit.HOURS)
            .build();

    public AdhocRuleCache(JdbcTemplate jdbc, ObjectMapper objectMapper,
                          @Value("${rule.catalog.version:1}") String catalogVersion) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.catalogVersion = catalogVersion;
    }

    public String keyFor(String lcRawText) {
        if (lcRawText == null) lcRawText = "";
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(lcRawText.getBytes());
            md.update((byte) '|');
            md.update(catalogVersion.getBytes());
            return HexFormat.of().formatHex(md.digest());
        } catch (Exception e) {
            return Integer.toHexString((lcRawText + "|" + catalogVersion).hashCode());
        }
    }

    public Optional<List<Rule>> get(String key) {
        List<Rule> hit = hot.getIfPresent(key);
        if (hit != null) return Optional.of(hit);
        try {
            String json = jdbc.queryForObject(
                    "SELECT rules_json::text FROM lc_v2.adhoc_rule_cache WHERE cache_key = ?",
                    String.class, key);
            if (json == null) return Optional.empty();
            Rule[] arr = objectMapper.readValue(json, Rule[].class);
            List<Rule> rules = List.of(arr);
            hot.put(key, rules);
            return Optional.of(rules);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("adhoc cache read failed key={}: {}", key, e.getMessage());
            return Optional.empty();
        }
    }

    public void put(String key, List<Rule> rules) {
        hot.put(key, rules);
        try {
            String json = objectMapper.writeValueAsString(rules);
            jdbc.update("""
                    INSERT INTO lc_v2.adhoc_rule_cache (cache_key, rules_json, created_at)
                    VALUES (?, ?::jsonb, NOW())
                    ON CONFLICT (cache_key) DO UPDATE
                    SET rules_json = EXCLUDED.rules_json, created_at = NOW()
                    """, key, json);
        } catch (Exception e) {
            log.warn("adhoc cache write failed key={}: {}", key, e.getMessage());
        }
    }
}
