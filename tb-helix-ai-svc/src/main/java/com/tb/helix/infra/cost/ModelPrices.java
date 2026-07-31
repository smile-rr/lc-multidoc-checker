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

    public record Price(
            String family, String label, String vendor, String tier,
            BigDecimal in, BigDecimal out, BigDecimal cachedIn,
            List<String> patterns) {

        /**
         * What these tokens cost, in USD.
         *
         * <p>Cached prompt tokens are billed at the vendor's cache rate where there is one
         * and at the ordinary input rate where there is not — never free, which is the
         * mistake that makes a heavily cached run look like it cost nothing.
         */
        public BigDecimal cost(long promptTokens, long completionTokens, long cachedPromptTokens) {
            long fresh = Math.max(0, promptTokens - cachedPromptTokens);
            BigDecimal cacheRate = cachedIn == null ? in : cachedIn;
            return in.multiply(BigDecimal.valueOf(fresh))
                    .add(cacheRate.multiply(BigDecimal.valueOf(cachedPromptTokens)))
                    .add(out.multiply(BigDecimal.valueOf(completionTokens)))
                    .divide(PER, 6, RoundingMode.HALF_UP);
        }
    }

    /** The family a model id resolves to when the book has never heard of it. */
    public static final Price UNKNOWN = new Price(
            null, "Unpriced", "unknown", "none",
            BigDecimal.ZERO, BigDecimal.ZERO, null, List.of());

    private final JdbcTemplate jdbc;
    private final AtomicReference<List<Price>> book = new AtomicReference<>(List.of());

    public ModelPrices(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        refresh();
    }

    /** Rereads the table. Cheap, and the only way a price change takes effect. */
    public final void refresh() {
        try {
            List<Price> rows = jdbc.query("""
                    SELECT family, label, vendor, tier,
                           in_per_million, out_per_million, cached_in_per_million, match_patterns
                      FROM helix_infra.model_price
                    """, (rs, i) -> new Price(
                    rs.getString("family"), rs.getString("label"), rs.getString("vendor"),
                    rs.getString("tier"),
                    rs.getBigDecimal("in_per_million"), rs.getBigDecimal("out_per_million"),
                    rs.getBigDecimal("cached_in_per_million"),
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
