package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.persistence.SessionStore;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Two-tier cache for runtime-generated rule proposals: in-memory Caffeine (hot) +
 * {@code lc_v2.dynamic_rules} JSONB (cross-process, survives JVM restart).
 *
 * Cache key: {@code sha256(lc_raw_text + "|" + catalog_version)}.
 * Catalog version is configurable via {@code rule.catalog.version} (default 1)
 * and should be bumped when catalog rules change so old proposals don't clash
 * with newly-added catalog coverage.
 */
@Component
public class AdhocRuleCache {

    private static final Logger log = LoggerFactory.getLogger(AdhocRuleCache.class);

    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;
    private final String catalogVersion;
    private final Cache<String, List<Rule>> hot = Caffeine.newBuilder()
            .maximumSize(256)
            .expireAfterWrite(2, TimeUnit.HOURS)
            .build();

    public AdhocRuleCache(SessionStore sessionStore, ObjectMapper objectMapper,
                          @Value("${rule.catalog.version:1}") String catalogVersion) {
        this.sessionStore = sessionStore;
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
            String json = sessionStore.getDynamicRules(key);
            if (json == null) return Optional.empty();
            Rule[] arr = objectMapper.readValue(json, Rule[].class);
            List<Rule> rules = List.of(arr);
            hot.put(key, rules);
            return Optional.of(rules);
        } catch (Exception e) {
            log.warn("dynamic rules cache read failed key={}: {}", key, e.getMessage());
            return Optional.empty();
        }
    }

    public void put(String key, List<Rule> rules) {
        hot.put(key, rules);
        try {
            String json = objectMapper.writeValueAsString(rules);
            sessionStore.putDynamicRules(key, json);
        } catch (Exception e) {
            log.warn("dynamic rules cache write failed key={}: {}", key, e.getMessage());
        }
    }
}
