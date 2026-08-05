package com.tb.helix.infra.cost;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * The call ledger, in Postgres.
 *
 * <p>Separate from {@link ModelCallLog} because lc-check reads the spend and must name the
 * port rather than this — the same rule that keeps a stage from naming DiskBlobStore, and
 * the one ArchUnit checks.
 */
@Component
public class PgModelCallLog implements ModelCallLog {

    private static final Logger log = LoggerFactory.getLogger(PgModelCallLog.class);

    private final JdbcTemplate jdbc;

    private final ModelPrices prices;

    public PgModelCallLog(JdbcTemplate jdbc, ModelPrices prices) {
        this.jdbc = jdbc;
        this.prices = prices;
    }

    @Override
    public void record(Call call) {
        try {
            jdbc.update("""
                    INSERT INTO helix_infra.model_call
                        (case_id, stage, step, role, slot, model_id, provider, kind,
                         status, attempt, prompt_tokens, completion_tokens, cached_prompt_tokens,
                         cache_write_tokens, reasoning_tokens,
                         latency_ms, derivation_key, error)
                    VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    call.caseId(), call.stage(), call.step(), call.role(), call.slot(),
                    call.modelId(), call.provider(),
                    call.kind().name(), call.status().name(), call.attempt(),
                    call.promptTokens(), call.completionTokens(), call.cachedPromptTokens(),
                    call.cacheWriteTokens(), call.reasoningTokens(),
                    call.latencyMs(), call.derivationKey(), trim(call.error()));
        } catch (RuntimeException e) {
            log.debug("Model call not recorded ({} {}): {}", call.role(), call.modelId(), e.toString());
        }
    }

    /**
     * What one examination spent, by model.
     *
     * <p>Cost is computed here rather than stored. Rates change, and a stored total is a
     * number that stops matching the rate it was computed from without ever saying so.
     */
    @Override
    public List<Map<String, Object>> spendForCase(String caseId) {
        List<Map<String, Object>> rows = jdbc.query("""
                SELECT stage, step, model_id, role, kind,
                       MAX(prompt_tokens)                              AS longest,
                       COUNT(*)                                        AS calls,
                       COUNT(*) FILTER (WHERE status = 'CACHED')       AS cached,
                       COUNT(*) FILTER (WHERE status IN ('FAILED', 'TIMEOUT')) AS failed,
                       -- Billed: only calls that actually reached a provider.
                       COALESCE(SUM(prompt_tokens)
                           FILTER (WHERE status = 'OK'), 0)            AS tokens_in,
                       COALESCE(SUM(completion_tokens)
                           FILTER (WHERE status = 'OK'), 0)            AS tokens_out,
                       COALESCE(SUM(cached_prompt_tokens)
                           FILTER (WHERE status = 'OK'), 0)            AS tokens_cached,
                       COALESCE(SUM(cache_write_tokens)
                           FILTER (WHERE status = 'OK'), 0)            AS tokens_cache_write,
                       COALESCE(SUM(reasoning_tokens)
                           FILTER (WHERE status = 'OK'), 0)            AS tokens_reasoning,
                       -- Avoided: derivation-cache hits carry what the original call reported.
                       COALESCE(SUM(prompt_tokens)
                           FILTER (WHERE status = 'CACHED'), 0)        AS tokens_in_avoided,
                       COALESCE(SUM(completion_tokens)
                           FILTER (WHERE status = 'CACHED'), 0)        AS tokens_out_avoided,
                       COALESCE(SUM(latency_ms)
                           FILTER (WHERE status = 'OK'), 0)            AS ms,
                       -- Earliest attempt in the group — the cost drawer lists steps
                       -- in the order they ran, not alphabetical stage/step.
                       MIN(at)                                         AS first_at
                  FROM helix_infra.model_call
                 WHERE case_id = ?::uuid
                 GROUP BY stage, step, model_id, role, kind
                 ORDER BY MIN(at), stage, step, model_id
                """.formatted(lengthBucket()), (rs, i) -> {
            Map<String, Object> r = new java.util.LinkedHashMap<>();
            // Grouped by step as well as by model, because "what did this run spend"
            // and "which step spent it" are the same question asked at two depths, and
            // a total with no step attached cannot answer the second.
            String model = rs.getString("model_id");
            long tin = rs.getLong("tokens_in");
            long tout = rs.getLong("tokens_out");
            long tinAvoided = rs.getLong("tokens_in_avoided");
            long toutAvoided = rs.getLong("tokens_out_avoided");
            r.put("stage", rs.getString("stage"));
            r.put("step", rs.getString("step"));
            r.put("modelId", model);
            var firstAt = rs.getTimestamp("first_at");
            if (firstAt != null) r.put("firstAt", firstAt.toInstant().toString());
            // Resolved now, from the id we actually called. Grouping by a family written
            // at insert time would freeze each row against the patterns as they stood that
            // day, so a book edit would leave the grouping and the price disagreeing about
            // the same call — and only the price would be right.
            r.put("family", prices.familyOf(model));
            r.put("role", rs.getString("role"));
            r.put("kind", rs.getString("kind"));
            r.put("calls", rs.getLong("calls"));
            r.put("cached", rs.getLong("cached"));
            r.put("failed", rs.getLong("failed"));
            r.put("tokensIn", tin);
            r.put("tokensOut", tout);
            r.put("tokensCached", rs.getLong("tokens_cached"));
            // Breakdowns of tokensIn and tokensOut, not additions to them. A panel that
            // stacks all four as segments of one bar draws a run twice its real size.
            r.put("tokensCacheWrite", rs.getLong("tokens_cache_write"));
            r.put("tokensReasoning", rs.getLong("tokens_reasoning"));
            r.put("tokensInAvoided", tinAvoided);
            r.put("tokensOutAvoided", toutAvoided);
            r.put("ms", rs.getLong("ms"));
            // Money for what was billed — never for a derivation-cache hit. Those rows
            // store the original call's tokens so the log can say what was avoided; pricing
            // them as spend made a fully-cached run look like a paid one.
            // Priced at the band the calls in this group were in — never at the band their
            // *sum* falls in. Every call here shares one bucket, so the longest of them names
            // the band for all of them.
            long longest = rs.getLong("longest");
            ModelPrices.Price price = prices.of(model);
            r.put("cost", price.costInBandOf(longest, tin, tout,
                    rs.getLong("tokens_cached"), rs.getLong("tokens_cache_write")));
            r.put("costAvoided", price.costInBandOf(longest, tinAvoided, toutAvoided, 0));
            // The rate this row was actually priced at, so the drawer can show its
            // working rather than asking to be believed.
            r.putAll(rateOf(price, longest));
            return r;
        }, caseId);
        return rows;
    }


    @Override
    public Map<String, Object> spendSince(java.time.Instant since) {
        // Same rule as spendForCase: derivation-cache hits (status=CACHED) carry the
        // tokens the original call would have used so we can price what was avoided.
        // They must never enter the billed total — that was the bug that made a fully
        // cached period look as expensive as a cold one on the AI Spend panel.
        List<Map<String, Object>> byModel = jdbc.query("""
                SELECT model_id,
                       MAX(prompt_tokens)                                     AS longest,
                       COUNT(*)                                               AS calls,
                       COUNT(*) FILTER (WHERE status = 'OK')                  AS billed,
                       COUNT(*) FILTER (WHERE status = 'CACHED')              AS cached,
                       COUNT(*) FILTER (WHERE status IN ('FAILED','TIMEOUT')) AS failed,
                       COUNT(DISTINCT case_id)                                AS cases,
                       COALESCE(SUM(prompt_tokens)
                           FILTER (WHERE status = 'OK'), 0)                   AS tokens_in,
                       COALESCE(SUM(completion_tokens)
                           FILTER (WHERE status = 'OK'), 0)                   AS tokens_out,
                       COALESCE(SUM(cached_prompt_tokens)
                           FILTER (WHERE status = 'OK'), 0)                   AS tokens_cached,
                       COALESCE(SUM(cache_write_tokens)
                           FILTER (WHERE status = 'OK'), 0)                   AS tokens_cache_write,
                       COALESCE(SUM(reasoning_tokens)
                           FILTER (WHERE status = 'OK'), 0)                   AS tokens_reasoning,
                       COALESCE(SUM(prompt_tokens)
                           FILTER (WHERE status = 'CACHED'), 0)               AS tokens_in_avoided,
                       COALESCE(SUM(completion_tokens)
                           FILTER (WHERE status = 'CACHED'), 0)               AS tokens_out_avoided,
                       COALESCE(SUM(latency_ms)
                           FILTER (WHERE status = 'OK'), 0)                   AS ms
                  FROM helix_infra.model_call
                 WHERE at >= ?
                 GROUP BY model_id, %s
                 ORDER BY ms DESC
                """.formatted(lengthBucket()), (rs, i) -> {
            Map<String, Object> r = new java.util.LinkedHashMap<>();
            String model = rs.getString("model_id");
            long tin = rs.getLong("tokens_in");
            long tout = rs.getLong("tokens_out");
            long tcached = rs.getLong("tokens_cached");
            long tinAvoided = rs.getLong("tokens_in_avoided");
            long toutAvoided = rs.getLong("tokens_out_avoided");
            r.put("modelId", model);
            r.put("family", prices.familyOf(model));
            r.put("label", prices.of(model).label());
            r.put("calls", rs.getLong("calls"));
            r.put("billed", rs.getLong("billed"));
            r.put("cached", rs.getLong("cached"));
            r.put("failed", rs.getLong("failed"));
            r.put("cases", rs.getLong("cases"));
            long tcacheWrite = rs.getLong("tokens_cache_write");
            r.put("tokensIn", tin);
            r.put("tokensOut", tout);
            r.put("tokensCachedIn", tcached);
            // Both are breakdowns — tokensCacheWrite is inside tokensIn, tokensReasoning is
            // inside tokensOut. Neither is a fifth quantity to add to a total.
            r.put("tokensCacheWrite", tcacheWrite);
            r.put("tokensReasoning", rs.getLong("tokens_reasoning"));
            r.put("tokensInAvoided", tinAvoided);
            r.put("tokensOutAvoided", toutAvoided);
            r.put("seconds", rs.getLong("ms") / 1000.0);
            // Prompt-cached input charged at the cache rate, exactly as spendForCase does.
            // Passing 0 here priced it at the full rate, so the portfolio total and the sum
            // of its own cases would drift apart the moment a provider started reporting a
            // prompt cache — two numbers for one bill, with nothing to say which was right.
            long longest = rs.getLong("longest");
            ModelPrices.Price price = prices.of(model);
            r.put("cost", price.costInBandOf(longest, tin, tout, tcached, tcacheWrite));
            r.put("costAvoided", price.costInBandOf(longest, tinAvoided, toutAvoided, 0));
            // Same shape as spendForCase. Two endpoints that both answer "what did this
            // model cost" and describe the rate differently is the drift this class keeps
            // warning about, and the portfolio panel will want the book too.
            r.putAll(rateOf(price, longest));
            return r;
        }, java.sql.Timestamp.from(since));

        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        java.math.BigDecimal avoided = java.math.BigDecimal.ZERO;
        long calls = 0, cached = 0, billed = 0;
        for (Map<String, Object> m : byModel) {
            total = total.add((java.math.BigDecimal) m.get("cost"));
            avoided = avoided.add((java.math.BigDecimal) m.get("costAvoided"));
            calls += (Long) m.get("calls");
            cached += (Long) m.get("cached");
            billed += (Long) m.get("billed");
        }
        Long cases = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT case_id) FROM helix_infra.model_call WHERE at >= ? AND case_id IS NOT NULL",
                Long.class, java.sql.Timestamp.from(since));
        long n = cases == null ? 0 : cases;

        // Time in models, per case, at the median.
        //
        // A median rather than a mean because one pathological case — a slot that timed out
        // three times before answering — moves an average and tells you nothing about a
        // typical presentation. And per case from the *ledger*, because that is the only
        // place machine time is recorded: the case row knows when it was created and when it
        // was signed off, which on an officer-paced pipeline is mostly how long somebody was
        // at lunch.
        //
        // Cached calls are in it at their real latency (near zero), which is the honest
        // answer: a run that was answered from cache genuinely took no time.
        Double median = jdbc.queryForObject("""
                SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY per_case), 0)
                  FROM (SELECT case_id, SUM(latency_ms) AS per_case
                          FROM helix_infra.model_call
                         WHERE at >= ? AND case_id IS NOT NULL
                         GROUP BY case_id) c
                """, Double.class, java.sql.Timestamp.from(since));

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("medianCaseSeconds", median == null ? 0d : median / 1000.0);
        out.put("cost", total);
        out.put("costAvoided", avoided);
        out.put("cases", n);
        out.put("costPerCase", n == 0 ? java.math.BigDecimal.ZERO
                : total.divide(java.math.BigDecimal.valueOf(n), 6, java.math.RoundingMode.HALF_UP));
        out.put("calls", calls);
        out.put("billed", billed);
        out.put("cachedPct", calls == 0 ? 0 : Math.round((cached * 100.0) / calls));
        out.put("byModel", byModel);
        return out;
    }


    /**
     * The rate a group of calls was charged at, as the panel has to print it.
     *
     * <p>The <b>band</b> rate, not the family's flat pair. Cost above came from
     * {@link ModelPrices.Price#costInBandOf}, which picks a rate by input length — so on a
     * banded family (Qwen's international tables step to roughly four times the base rate
     * past 256K) the flat pair would not reproduce the figure printed beside it. A reader
     * who multiplies the tokens by the rate we showed and gets a different number learns
     * that the panel cannot be checked, which is worse than never having shown a rate.
     *
     * <p>{@code priced} rather than a zero rate for a model the book has never heard of.
     * Zero is a rate, and $0.00/M reads as a free model; an unpriced call is one whose cost
     * we do not know, and a panel must be able to say so.
     *
     * @param bandLength the longest input in the group — the same value that priced it
     */
    private static Map<String, Object> rateOf(ModelPrices.Price price, long bandLength) {
        Map<String, Object> r = new java.util.LinkedHashMap<>();
        boolean priced = price.family() != null;
        r.put("priced", priced);
        r.put("label", price.label());
        r.put("vendor", price.vendor());
        r.put("tier", price.tier());
        if (!priced) return r;
        // The family's own rate, independent of this run. A price table is a statement
        // about the book, not about what happened to be called — so it must not shift
        // because one call in this case crossed a length boundary.
        r.put("baseInPerMillion", price.in());
        r.put("baseOutPerMillion", price.out());
        ModelPrices.Band band = price.bandFor(bandLength);
        r.put("inPerMillion", band.in());
        r.put("outPerMillion", band.out());
        // Null where the vendor has no cache rate — the caller must then say the cached
        // input was charged at the ordinary input rate, which is what pricing does.
        r.put("cachedInPerMillion", band.cachedIn());
        // Likewise null where writes are not priced apart. Dearer than input where it is
        // not null, so a panel that renders it beside the cache read rate must not imply
        // the two are the same kind of saving — one of them is what the saving costs.
        r.put("cacheWritePerMillion", band.cacheWrite());
        // Only when the family actually has bands, and only when the one that applied is
        // not the last: an unbounded "up to 2147483647" is an implementation detail, and
        // printing it beside a rate would invite someone to read it as a real limit.
        if (!price.bands().isEmpty() && band.upToPromptTokens() != Integer.MAX_VALUE) {
            r.put("bandUpTo", band.upToPromptTokens());
        }
        return r;
    }

    /**
     * A SQL expression that puts each call in the length bucket its band belongs to.
     *
     * <p>Built from the book's own boundaries rather than hard-coded, and inlined rather than
     * bound: they are integers this service just read out of its own table, and a bound array
     * cannot appear in a GROUP BY the way an expression can.
     *
     * <p>Empty book, or a book with no bands at all, collapses to a constant — one bucket,
     * which is exactly right when nothing prices by length.
     *
     * <p><b>The cast on that constant is load-bearing.</b> A bare integer in {@code GROUP BY}
     * is an <em>ordinal position</em> in PostgreSQL, not a value, so {@code GROUP BY model_id,
     * 0} asks to group by the zeroth selected column and is rejected — which is every spend
     * query in a deployment whose price book prices nothing by length, i.e. the flat book this
     * service ships with. {@code 0::int} is an expression and groups by the constant, which is
     * what the sentence above always meant.
     */
    private String lengthBucket() {
        List<Integer> edges = prices.bandEdges();
        if (edges.isEmpty()) return "0::int";
        String array = edges.stream().map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(", "));
        return "width_bucket(prompt_tokens::numeric, ARRAY[" + array + "]::numeric[])";
    }

    /** An error message is a note, not an essay — a stack trace here helps nobody. */
    private static String trim(String error) {
        if (error == null) return null;
        return error.length() <= 500 ? error : error.substring(0, 500);
    }
}
