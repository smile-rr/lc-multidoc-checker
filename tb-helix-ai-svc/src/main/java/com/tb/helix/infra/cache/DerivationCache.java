package com.tb.helix.infra.cache;

import java.util.Optional;
import java.util.function.Supplier;

/**
 * "Have we already answered this exact question?"
 *
 * <p>The one place expensive work is guarded. Callers should reach for
 * {@link #computeIfAbsent} rather than {@link #lookup} plus {@link #store}: the two-call
 * form invites the mistake of doing the work first and consulting the cache afterwards,
 * which saves nothing.
 *
 * <p><b>A miss must never be an error.</b> Every failure in this layer — the row is
 * malformed, the database is unreachable, the stored JSON no longer parses — degrades to
 * a miss and is logged. A cache that can fail a request is a cache that has become a
 * dependency, and this one is an optimisation.
 *
 * <p>Backed by a tier stack (memory, optionally Redis, then Postgres). Callers see one
 * interface; which tier answered shows up in the {@link Hit} so a step can record how it
 * was satisfied.
 */
public interface DerivationCache {

    /**
     * What was found, and where.
     *
     * @param value     the cached answer, decoded to the requested type
     * @param tier      which tier served it — worth recording, because an L1 hit and an
     *                  L3 hit have very different things to say about a run
     * @param blobSha   set when the answer is bytes rather than JSON (a converted PDF,
     *                  a page render); the value then describes them
     * @param hitCount  how many times this entry has been used, after this hit
     */
    record Hit<T>(T value, CacheTier.Level tier, String blobSha, int hitCount) {
    }

    /**
     * The result of an expensive call, on its way into the cache.
     *
     * @param value       the structured answer, serialised to JSON
     * @param blobSha     the answer's bytes, when it has any; null otherwise
     * @param rawResponse the provider's verbatim payload. Kept because when an
     *                    extraction is wrong the question is always "what did the model
     *                    actually say", and a parsed envelope cannot answer it.
     * @param usage       tokens and latency, for the run's cost record
     */
    record Entry<T>(T value, String blobSha, String rawResponse, Usage usage) {

        public static <T> Entry<T> of(T value) {
            return new Entry<>(value, null, null, null);
        }

        public static <T> Entry<T> of(T value, String blobSha) {
            return new Entry<>(value, blobSha, null, null);
        }
    }

    /** Tokens and latency for one call, recorded alongside its answer. */
    /**
     * What one call cost, and which model charged it.
     *
     * <p>The model is here rather than taken from the cache key, because the key holds a
     * role placeholder — {@code role:extract} — chosen before a slot was picked. A cached
     * row priced off that placeholder resolves to no family and therefore to no money,
     * which is the whole of what a cache is meant to be able to report.
     */
    record Usage(Integer promptTokens, Integer completionTokens, Integer totalTokens,
                 Integer latencyMs, String modelId) {

        /**
         * Nothing was spent — the answer came from somewhere that costs nothing.
         *
         * <p>Distinct from {@code null}, which means nobody recorded it. A run with no
         * usage row and a run that genuinely cost nothing look identical on a bill, and
         * only one of them is a reporting bug.
         */
        public static final Usage FREE = new Usage(0, 0, 0, 0, null);
    }

    /** Looks up an answer without computing one. */
    <T> Optional<Hit<T>> lookup(DerivationKey key, Class<T> type);

    /** Stores an answer. Overwrites any existing entry for the same key. */
    <T> void store(DerivationKey key, Entry<T> entry);

    /**
     * The form callers should use: look up, and only on a miss do the work.
     *
     * <p>{@code work} is not invoked on a hit, which is the entire point — it is where
     * the PDF render and the HTTP request live.
     *
     * @return the answer and how it was obtained; {@code Hit.tier} is
     *         {@link CacheTier.Level#NONE} when the work actually ran
     */
    <T> Hit<T> computeIfAbsent(DerivationKey key, Class<T> type, Supplier<Entry<T>> work);

    /** Deletes expired entries. Driven by a schedule, safe to call at any time. */
    int purgeExpired();
}
