package com.tb.helix.infra.config;

import com.tb.helix.infra.cache.CacheOp;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Map;

/**
 * {@code helix.cache.*}
 *
 * <p>Three tiers, and L2 exists switched off. That is the whole design intent: the shared
 * tier is written and configured so that turning it on is a property flip when there is a
 * second instance to share with, and until then nothing connects to a Redis that is not
 * deployed.
 */
@ConfigurationProperties(prefix = "helix.cache")
public record CacheProperties(L1 l1, L2 l2, L3 l3) {

    public CacheProperties {
        l1 = l1 == null ? new L1(true, 512, Duration.ofMinutes(10)) : l1;
        l2 = l2 == null ? new L2(false, "localhost", 6379, "", Duration.ofHours(24)) : l2;
        l3 = l3 == null ? new L3(true, Map.of(), "0 30 3 * * *") : l3;
    }

    /**
     * In-process. Bounded by weight rather than entry count, because entries here differ
     * in size by three orders of magnitude — a parsed envelope is a few kilobytes, a
     * rendered page is one and a half megabytes. A count-bounded cache holding renders is
     * a heap exhaustion waiting for a busy morning.
     */
    public record L1(boolean enabled, int maxWeightMb, Duration ttl) {
    }

    /** Shared. Complete, configured, and off. */
    public record L2(boolean enabled, String host, int port, String password, Duration ttl) {
    }

    /**
     * Durable — Postgres for structured answers, the blob store for byte-valued ones.
     *
     * @param ttl per-op overrides keyed by {@link CacheOp} name. A value of zero means
     *            never expire, which is right for anything deterministic: the answer to
     *            "what is the PDF of this TIFF" cannot go stale, because nothing about
     *            the question can change.
     */
    public record L3(boolean enabled, Map<String, Duration> ttl, String purgeCron) {

        private static final Duration FALLBACK = Duration.ofDays(90);

        /** The TTL for an op: its own, else the configured default, else 90 days. */
        public Duration ttlFor(String op) {
            Duration d = ttl.get(op);
            if (d == null) d = ttl.get("default");
            return d == null ? FALLBACK : d;
        }
    }
}
