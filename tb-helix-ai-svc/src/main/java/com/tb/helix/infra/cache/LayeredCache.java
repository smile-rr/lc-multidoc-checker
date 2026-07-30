package com.tb.helix.infra.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.core.cache.CacheTier;
import com.tb.helix.core.cache.DerivationCache;
import com.tb.helix.core.cache.DerivationKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * The cache the rest of the service sees.
 *
 * <p>Walks L1 → L2 → L3 and back-fills upward on a hit, so an answer found in Postgres is
 * in memory for the next caller. Which tier answered is reported, because an L1 hit and an
 * L3 hit have very different things to say about a run.
 *
 * <p>{@link #computeIfAbsent} is the method callers should use. The two-call form exists
 * for the cases that genuinely need it, but it invites doing the work first and consulting
 * the cache afterwards — which saves the model call and still pays for the PDF render, and
 * is the single easiest way to build a cache that appears not to help.
 */
@Component
public class LayeredCache implements DerivationCache {

    private static final Logger log = LoggerFactory.getLogger(LayeredCache.class);

    private final List<CacheTier> tiers;
    private final PgDerivationStore l3;
    private final ObjectMapper json;

    public LayeredCache(List<CacheTier> tiers, PgDerivationStore l3, ObjectMapper json) {
        // Ordered by level so the walk is cheapest-first regardless of bean discovery order.
        this.tiers = tiers.stream()
                .filter(CacheTier::enabled)
                .sorted(Comparator.comparing(CacheTier::level))
                .toList();
        this.l3 = l3;
        this.json = json;
        log.info("Cache tiers active: {}", this.tiers.stream().map(t -> t.level().name()).toList());
    }

    @Override
    public <T> Optional<Hit<T>> lookup(DerivationKey key, Class<T> type) {
        String k = key.hash();

        // Memory tiers hold the serialised answer, so a hit here skips the database
        // entirely — which is the point of having them.
        for (CacheTier tier : tiers) {
            Optional<byte[]> raw = tier.get(k);
            if (raw.isPresent()) {
                Optional<T> decoded = decode(raw.get(), type);
                if (decoded.isPresent()) {
                    return Optional.of(new Hit<>(decoded.get(), tier.level(), null, 0));
                }
                // Undecodable bytes mean a shape change. Drop them and fall through
                // rather than serving something the caller cannot use.
                tier.evict(k);
            }
        }

        Optional<PgDerivationStore.Row> row = l3.lookup(k);
        if (row.isEmpty()) return Optional.empty();

        Optional<T> value = l3.decode(row.get().resultJson(), type);
        if (value.isEmpty() && row.get().blobSha() == null) return Optional.empty();

        promote(k, row.get().resultJson(), key);
        return Optional.of(new Hit<>(value.orElse(null), CacheTier.Level.L3,
                row.get().blobSha(), row.get().hitCount()));
    }

    @Override
    public <T> void store(DerivationKey key, Entry<T> entry) {
        String k = key.hash();
        l3.store(key, entry.value(), entry.blobSha(), entry.rawResponse(), entry.usage());
        if (entry.value() != null) {
            try {
                byte[] bytes = json.writeValueAsBytes(entry.value());
                for (CacheTier tier : tiers) {
                    tier.put(k, bytes, Duration.ZERO);
                }
            } catch (Exception e) {
                log.warn("Could not populate memory tiers for {}: {}", key.op(), e.toString());
            }
        }
    }

    @Override
    public <T> Hit<T> computeIfAbsent(DerivationKey key, Class<T> type, Supplier<Entry<T>> work) {
        Optional<Hit<T>> hit = lookup(key, type);
        if (hit.isPresent()) {
            log.debug("cache-hit {} {} from {}", key.op(), key.inputScope(), hit.get().tier());
            return hit.get();
        }

        // The miss path. Everything expensive is inside this supplier, and nothing above
        // this line touched a PDF or opened a socket.
        Entry<T> produced = work.get();
        store(key, produced);
        return new Hit<>(produced.value(), CacheTier.Level.NONE, produced.blobSha(), 0);
    }

    @Override
    @Scheduled(cron = "${helix.cache.l3.purge-cron:0 30 3 * * *}")
    public int purgeExpired() {
        int removed = l3.purgeExpired();
        if (removed > 0) log.info("Purged {} expired derivation(s)", removed);
        return removed;
    }

    private <T> Optional<T> decode(byte[] bytes, Class<T> type) {
        try {
            return Optional.ofNullable(json.readValue(bytes, type));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /** Back-fills the faster tiers after an L3 hit. */
    private void promote(String key, String resultJson, DerivationKey source) {
        if (resultJson == null) return;
        byte[] bytes = resultJson.getBytes(StandardCharsets.UTF_8);
        for (CacheTier tier : tiers) {
            tier.put(key, bytes, Duration.ZERO);
        }
        log.trace("promoted {} into memory tiers", source.op());
    }
}
