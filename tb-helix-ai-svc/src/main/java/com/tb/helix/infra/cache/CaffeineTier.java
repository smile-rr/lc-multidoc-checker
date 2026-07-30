package com.tb.helix.infra.cache;

import com.tb.helix.infra.config.CacheProperties;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

/**
 * L1 — in process, bounded, gone on restart.
 *
 * <p>Its job is a narrow one: stop the same work happening twice within a single run.
 * Several vision slots reading the same pages, one PDF served to a viewer and then split
 * for a document — those are the hits worth having, and they all occur within seconds of
 * each other, which is why the TTL is minutes rather than hours.
 *
 * <p><b>Bounded by weight.</b> Its predecessor was an unbounded {@code ConcurrentHashMap}
 * of PDF byte arrays with no eviction except an explicit per-session sweep, which is a
 * heap leak wearing a cache's clothes. Here the weight is the byte length, so a hundred
 * rendered pages evict correctly against a thousand small envelopes.
 */
@Component
public class CaffeineTier implements CacheTier {

    private static final Logger log = LoggerFactory.getLogger(CaffeineTier.class);

    private final Cache<String, byte[]> cache;
    private final boolean enabled;

    public CaffeineTier(CacheProperties props) {
        CacheProperties.L1 cfg = props.l1();
        this.enabled = cfg.enabled();
        this.cache = Caffeine.newBuilder()
                .maximumWeight((long) cfg.maxWeightMb() * 1024 * 1024)
                .weigher((String key, byte[] value) -> value.length)
                .expireAfterWrite(cfg.ttl())
                .recordStats()
                .build();
        log.info("L1 cache {} ({} MB, ttl {})",
                enabled ? "enabled" : "disabled", cfg.maxWeightMb(), cfg.ttl());
    }

    @Override
    public Level level() {
        return Level.L1;
    }

    @Override
    public boolean enabled() {
        return enabled;
    }

    @Override
    public Optional<byte[]> get(String key) {
        return enabled ? Optional.ofNullable(cache.getIfPresent(key)) : Optional.empty();
    }

    @Override
    public void put(String key, byte[] value, Duration ttl) {
        // The TTL is uniform here: a per-entry expiry would need Caffeine's Expiry
        // interface and buy nothing, because everything in this tier is short-lived by
        // construction. L3 is where per-op lifetimes matter.
        if (enabled) cache.put(key, value);
    }

    @Override
    public void evict(String key) {
        cache.invalidate(key);
    }

    /** Hit rate and eviction count, for the metrics endpoint. */
    public com.github.benmanes.caffeine.cache.stats.CacheStats stats() {
        return cache.stats();
    }
}
