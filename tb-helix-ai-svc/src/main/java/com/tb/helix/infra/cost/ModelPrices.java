package com.tb.helix.infra.cost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * What a model costs, by family.
 *
 * <p>Families rather than exact model ids. A vendor ships a new number every few months —
 * {@code qwen3.7-flash} becomes {@code qwen3.8-flash} — and a price book keyed by version
 * answers "unknown model" the morning after an upgrade, silently reporting a run as free.
 * The tiers are what stay put: an economy model, a balanced one, a frontier one. So a
 * family owns the rate and a list of patterns that resolve a configured id onto it.
 *
 * <p>Longest pattern wins, so {@code claude-sonnet} beats a bare {@code sonnet} and
 * {@code deepseek-v4-pro} beats {@code deepseek}. Ordering by length rather than by an
 * explicit priority column means adding a more specific family cannot quietly lose to a
 * vaguer one already in the table.
 *
 * <p>Read once and held. It is a dozen rows that change when somebody edits them, so a
 * query per model call would be a round trip to learn something that has not moved since
 * boot. {@link #refresh()} is the way back if they do.
 */
@Component
public class ModelPrices {

    private static final Logger log = LoggerFactory.getLogger(ModelPrices.class);

    /** A million, as the rates are quoted. */
    private static final BigDecimal PER = new BigDecimal("1000000");

    /**
     * One rate, and the input length up to which it applies.
     *
     * @param upToPromptTokens inclusive upper bound on the input that selects this band
     */
    public record Band(int upToPromptTokens, BigDecimal in, BigDecimal out, BigDecimal cachedIn) {
    }

    /**
     * @param bands length bands, cheapest bound first. Empty for a vendor that charges one
     *              rate however long the prompt — which is most of them.
     */
    public record Price(
            String family, String label, String vendor, String tier,
            BigDecimal in, BigDecimal out, BigDecimal cachedIn,
            List<Band> bands, List<String> patterns) {

        /**
         * The rate that applies to an input of this length.
         *
         * <p>Qwen's international tables step from one rate to roughly four times it at 256K
         * tokens, so a family with bands and a flat rate would answer two different prices
         * for the same call. The bands win where they exist; the flat pair is what a family
         * without them charges, and what a reader that ignores bands sees.
         *
         * <p>Past the last band the last band is used rather than nothing. A vendor's table
         * stops at its context limit, so an input beyond it is a request that could not have
         * been made — and pricing it at zero would be the one answer certain to be wrong.
         */
        public Band bandFor(long promptTokens) {
            Band fits = null;      // the tightest bound that still covers this input
            Band widest = null;
            for (Band b : bands) {
                if (widest == null || b.upToPromptTokens() > widest.upToPromptTokens()) widest = b;
                if (b.upToPromptTokens() >= promptTokens
                        && (fits == null || b.upToPromptTokens() < fits.upToPromptTokens())) fits = b;
            }
            if (fits != null) return fits;
            if (widest != null) return widest;
            return new Band(Integer.MAX_VALUE, in, out, cachedIn);
        }

        /**
         * What these tokens cost, in USD.
         *
         * <p>Cached prompt tokens are billed at the vendor's cache rate where there is one
         * and at the ordinary input rate where there is not — never free, which is the
         * mistake that makes a heavily cached run look like it cost nothing.
         */
        public BigDecimal cost(long promptTokens, long completionTokens, long cachedPromptTokens) {
            return costInBandOf(promptTokens, promptTokens, completionTokens, cachedPromptTokens);
        }

        /**
         * The same, for tokens summed across several calls.
         *
         * <p>The band comes from one call's length, the money from the totals. Passing the
         * sum to {@link #bandFor} instead prices a hundred short calls as one enormous one —
         * 400K of 4K calls charged at the over-256K rate, which is exactly the over-report
         * that made the portfolio disagree with the sum of its own cases.
         *
         * @param bandLength a prompt length from the group, all of which share one band
         */
        public BigDecimal costInBandOf(long bandLength, long promptTokens,
                                       long completionTokens, long cachedPromptTokens) {
            Band band = bandFor(bandLength);
            long fresh = Math.max(0, promptTokens - cachedPromptTokens);
            BigDecimal cacheRate = band.cachedIn() == null ? band.in() : band.cachedIn();
            return band.in().multiply(BigDecimal.valueOf(fresh))
                    .add(cacheRate.multiply(BigDecimal.valueOf(cachedPromptTokens)))
                    .add(band.out().multiply(BigDecimal.valueOf(completionTokens)))
                    .divide(PER, 6, RoundingMode.HALF_UP);
        }
    }

    /** The family a model id resolves to when the book has never heard of it. */
    public static final Price UNKNOWN = new Price(
            null, "Unpriced", "unknown", "none",
            BigDecimal.ZERO, BigDecimal.ZERO, null, List.of(), List.of());

    private final JdbcTemplate jdbc;
    private final AtomicReference<List<Price>> book = new AtomicReference<>(List.of());

    public ModelPrices(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        refresh();
    }

    /** Rereads the table. Cheap, and the only way a price change takes effect. */
    public final void refresh() {
        try {
            // Bands first, so a family is built complete rather than patched afterwards.
            java.util.Map<String, List<Band>> bands = new java.util.HashMap<>();
            jdbc.query("""
                    SELECT family, up_to_prompt_tokens,
                           in_per_million, out_per_million, cached_in_per_million
                      FROM helix_infra.model_price_band
                     ORDER BY family, up_to_prompt_tokens
                    """, rs -> {
                bands.computeIfAbsent(rs.getString("family"), k -> new java.util.ArrayList<>())
                        .add(new Band(rs.getInt("up_to_prompt_tokens"),
                                rs.getBigDecimal("in_per_million"),
                                rs.getBigDecimal("out_per_million"),
                                rs.getBigDecimal("cached_in_per_million")));
            });

            List<Price> rows = jdbc.query("""
                    SELECT family, label, vendor, tier,
                           in_per_million, out_per_million, cached_in_per_million, match_patterns
                      FROM helix_infra.model_price
                    """, (rs, i) -> new Price(
                    rs.getString("family"), rs.getString("label"), rs.getString("vendor"),
                    rs.getString("tier"),
                    rs.getBigDecimal("in_per_million"), rs.getBigDecimal("out_per_million"),
                    rs.getBigDecimal("cached_in_per_million"),
                    bands.getOrDefault(rs.getString("family"), List.of()),
                    patterns(rs.getArray("match_patterns"))));

            // Sorted once, so resolution is a scan of an already-ordered list rather than a
            // sort per call.
            book.set(rows.stream()
                    .sorted(Comparator.comparingInt((Price p) -> -longest(p)))
                    .toList());
            log.info("Model price book loaded: {} families", rows.size());
        } catch (RuntimeException e) {
            log.warn("Model price book could not be read — calls will be recorded unpriced: {}", e.toString());
        }
    }

    /**
     * Every length boundary any family prices at, ascending.
     *
     * <p>Aggregating spend has to group calls so that no group straddles one of these, or the
     * sum is priced in a band none of its members were in — a hundred 4K calls summed to 400K
     * and charged at the >256K rate, which is how the portfolio came to report three and a
     * half times the sum of its own cases. The union across families is safe to use for every
     * family: it is a superset of any one family's boundaries, so a group inside one global
     * bucket is inside one band whichever family it turns out to be.
     */
    public List<Integer> bandEdges() {
        return book.get().stream()
                .flatMap(p -> p.bands().stream())
                .map(Band::upToPromptTokens)
                .distinct()
                .sorted()
                .toList();
    }

    /** Every family, most specific first. For a console that wants to show the book. */
    public List<Price> all() {
        return book.get();
    }

    /**
     * The family a configured model id belongs to.
     *
     * <p>Substring rather than prefix: providers prefix with an owner
     * ({@code anthropic/claude-sonnet-4-6}, {@code qwen/qwen3.7-flash}) often enough that
     * anchoring at the front would fail on exactly the ids a gateway is given.
     */
    public Price of(String modelId) {
        if (modelId == null || modelId.isBlank()) return UNKNOWN;
        String id = modelId.toLowerCase();
        for (Price p : book.get()) {
            for (String pattern : p.patterns()) {
                if (!pattern.isBlank() && id.contains(pattern)) return p;
            }
        }
        return UNKNOWN;
    }

    /** The family key, or null when unpriced — what a call row stores. */
    /** Convenience so a caller with a group of calls does not have to unwrap the price. */
    public BigDecimal costInBandOf(String modelId, long bandLength, long promptTokens,
                                   long completionTokens, long cachedPromptTokens) {
        return of(modelId).costInBandOf(bandLength, promptTokens, completionTokens, cachedPromptTokens);
    }

    public String familyOf(String modelId) {
        return Optional.ofNullable(of(modelId).family()).orElse(null);
    }

    private static int longest(Price p) {
        return p.patterns().stream().mapToInt(String::length).max().orElse(0);
    }

    private static List<String> patterns(java.sql.Array array) {
        try {
            return array == null ? List.of() : List.of((String[]) array.getArray());
        } catch (Exception e) {
            return List.of();
        }
    }
}
