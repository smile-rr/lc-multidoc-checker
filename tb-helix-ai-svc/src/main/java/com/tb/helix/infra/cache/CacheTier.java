package com.tb.helix.infra.cache;

import java.time.Duration;
import java.util.Optional;

/**
 * One layer of the cache stack.
 *
 * <p>Three exist, and the split is by what losing them costs:
 *
 * <table border="1">
 *   <caption>Tiers</caption>
 *   <tr><th>Tier</th><th>Holds</th><th>Survives</th><th>Default</th></tr>
 *   <tr><td>L1 memory</td><td>renders, PDFs, parsed envelopes</td><td>nothing</td><td>on</td></tr>
 *   <tr><td>L2 Redis</td><td>the same, shared across instances</td><td>a restart</td><td><b>off</b></td></tr>
 *   <tr><td>L3 Postgres + disk</td><td>the durable answer</td><td>everything</td><td>on</td></tr>
 * </table>
 *
 * <p>L2 is written, configured and switched off. That is deliberate: the design is
 * complete so that turning it on is a property flip when there is a second instance to
 * share with, and until then no Redis is deployed, connected to, or depended upon.
 *
 * <p>A lookup walks L1 → L2 → L3 and back-fills upward on a hit, so a value found in
 * Postgres is in memory for the next caller.
 *
 * <p>Implementations must treat every failure as a miss. A tier that throws takes the
 * request down with it, and none of these is worth a request.
 */
public interface CacheTier {

    /** Which tier answered. Recorded on the step, so a fast run can explain itself. */
    enum Level {
        /** Nothing was cached; the work ran. */
        NONE,
        /** In-process memory. */
        L1,
        /** Shared cache — Redis. */
        L2,
        /** Durable — Postgres, plus the blob store for byte-valued answers. */
        L3
    }

    Level level();

    /** Whether this tier is switched on. A disabled tier is skipped, never consulted. */
    boolean enabled();

    /** Returns the stored bytes, or empty on a miss <em>or any failure</em>. */
    Optional<byte[]> get(String key);

    /** Stores bytes. A failure here is logged and swallowed; it must not fail the call. */
    void put(String key, byte[] value, Duration ttl);

    /** Removes one entry. Used when an answer is known to be wrong, not for eviction. */
    void evict(String key);
}
