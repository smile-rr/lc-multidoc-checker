package com.tb.helix.infra.cache;

import com.tb.helix.infra.cost.CallScope;
import com.tb.helix.infra.cost.ModelCallLog;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
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
    private final DerivationStore l3;
    private final ObjectMapper json;
    private final ModelCallLog calls;

    /**
     * What the original call cost, by cache key.
     *
     * <p>The memory tiers hold the answer and not what producing it cost, so an L1 hit has
     * nothing to report on its own. This is populated at the two moments a key can enter
     * those tiers — a store, and a promotion after an L3 read — so any key capable of
     * producing an L1 hit has already been through here.
     *
     * <p>Bounded, and dropped wholesale when it fills. Losing it costs a cached row its
     * token counts until the next L3 read repopulates it, which is the right way for an
     * accounting nicety to fail.
     */
    private static final int SAVED_MAX = 4096;
    private final Map<String, Saved> saved = new ConcurrentHashMap<>();

    /** What a call cost the first time, so a hit can say what it avoided. */
    private record Saved(String modelId, int promptTokens, int completionTokens) {
    }

    public LayeredCache(List<CacheTier> tiers, DerivationStore l3, ObjectMapper json, ModelCallLog calls) {
        // Ordered by level so the walk is cheapest-first regardless of bean discovery order.
        this.tiers = tiers.stream()
                .filter(CacheTier::enabled)
                .sorted(Comparator.comparing(CacheTier::level))
                .toList();
        this.l3 = l3;
        this.json = json;
        this.calls = calls;
        log.info("Cache tiers active: {}; L3={}", this.tiers.stream().map(t -> t.level().name()).toList(),
                l3.getClass().getSimpleName());
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

        Optional<DerivationStore.Row> row = l3.lookup(k);
        if (row.isEmpty()) return Optional.empty();

        Optional<T> value = l3.decode(row.get().resultJson(), type);
        if (value.isEmpty() && row.get().blobSha() == null) return Optional.empty();

        promote(k, row.get().resultJson(), key);
        remember(k, row.get().modelId(), row.get().promptTokens(), row.get().completionTokens());
        return Optional.of(new Hit<>(value.orElse(null), CacheTier.Level.L3,
                row.get().blobSha(), row.get().hitCount()));
    }

    @Override
    public <T> void store(DerivationKey key, Entry<T> entry) {
        String k = key.hash();
        l3.store(key, entry.value(), entry.blobSha(), entry.rawResponse(), entry.usage());
        remember(k, entry.usage() != null && entry.usage().modelId() != null
                        ? entry.usage().modelId() : key.modelId(),
                entry.usage() == null ? null : entry.usage().promptTokens(),
                entry.usage() == null ? null : entry.usage().completionTokens());
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
            // Recorded, not merely logged. A run answered entirely from cache made no
            // provider calls and so left no ledger rows at all — which reads as a stage
            // that did nothing rather than one that did everything for free. What was
            // avoided is the most interesting number a cache has.
            recordAvoided(key);
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

    /**
     * Writes down a hit as a call that did not have to be made.
     *
     * <p>With the model and the tokens the original call reported, so the row prices like
     * any other and a cached run can be asked what it saved. It used to say
     * {@code role:extract} — a placeholder from the cache key — with zero tokens, which
     * resolved to no family and therefore to no money at all.
     */
    private void recordAvoided(DerivationKey key) {
        Saved s = saved.get(key.hash());
        var scope = CallScope.current();
        calls.record(new ModelCallLog.Call(
                scope.caseId(), scope.stage(), scope.step(),
                key.op(), null,
                s != null && s.modelId() != null ? s.modelId()
                        : key.modelId() == null ? "cache" : key.modelId(),
                null,
                ModelCallLog.Kind.TEXT, ModelCallLog.Status.CACHED, 1,
                s == null ? 0 : s.promptTokens(), s == null ? 0 : s.completionTokens(),
                0, 0, key.hash(), null));
    }

    private void remember(String hash, String modelId, Integer in, Integer out) {
        if (modelId == null && in == null && out == null) return;
        if (saved.size() >= SAVED_MAX) saved.clear();
        saved.put(hash, new Saved(modelId, in == null ? 0 : in, out == null ? 0 : out));
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
