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
                        (case_id, stage, step, role, slot, model_id, family, provider, kind,
                         status, attempt, prompt_tokens, completion_tokens, cached_prompt_tokens,
                         latency_ms, derivation_key, error)
                    VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    call.caseId(), call.stage(), call.step(), call.role(), call.slot(),
                    call.modelId(), prices.familyOf(call.modelId()), call.provider(),
                    call.kind().name(), call.status().name(), call.attempt(),
                    call.promptTokens(), call.completionTokens(), call.cachedPromptTokens(),
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
                SELECT stage, step, model_id, family, role, kind,
                       COUNT(*)                                        AS calls,
                       COUNT(*) FILTER (WHERE status = 'CACHED')       AS cached,
                       COUNT(*) FILTER (WHERE status IN ('FAILED', 'TIMEOUT')) AS failed,
                       COALESCE(SUM(prompt_tokens), 0)                 AS tokens_in,
                       COALESCE(SUM(completion_tokens), 0)             AS tokens_out,
                       COALESCE(SUM(cached_prompt_tokens), 0)          AS tokens_cached,
                       COALESCE(SUM(latency_ms), 0)                    AS ms
                  FROM helix_infra.model_call
                 WHERE case_id = ?::uuid
                 GROUP BY stage, step, model_id, family, role, kind
                 ORDER BY ms DESC
                """, (rs, i) -> {
            Map<String, Object> r = new java.util.LinkedHashMap<>();
            // Grouped by step as well as by model, because "what did this run spend"
            // and "which step spent it" are the same question asked at two depths, and
            // a total with no step attached cannot answer the second.
            r.put("stage", rs.getString("stage"));
            r.put("step", rs.getString("step"));
            r.put("modelId", rs.getString("model_id"));
            r.put("family", rs.getString("family"));
            r.put("role", rs.getString("role"));
            r.put("kind", rs.getString("kind"));
            r.put("calls", rs.getLong("calls"));
            r.put("cached", rs.getLong("cached"));
            r.put("failed", rs.getLong("failed"));
            r.put("tokensIn", rs.getLong("tokens_in"));
            r.put("tokensOut", rs.getLong("tokens_out"));
            r.put("tokensCached", rs.getLong("tokens_cached"));
            r.put("ms", rs.getLong("ms"));
            r.put("cost", prices.of(rs.getString("model_id"))
                    .cost(rs.getLong("tokens_in"), rs.getLong("tokens_out"), rs.getLong("tokens_cached")));
            return r;
        }, caseId);
        return rows;
    }


    @Override
    public Map<String, Object> spendSince(java.time.Instant since) {
        List<Map<String, Object>> byModel = jdbc.query("""
                SELECT model_id,
                       COUNT(*)                                               AS calls,
                       COUNT(*) FILTER (WHERE status = 'CACHED')              AS cached,
                       COUNT(*) FILTER (WHERE status IN ('FAILED','TIMEOUT')) AS failed,
                       COUNT(DISTINCT case_id)                                AS cases,
                       COALESCE(SUM(prompt_tokens), 0)                        AS tokens_in,
                       COALESCE(SUM(completion_tokens), 0)                    AS tokens_out,
                       COALESCE(SUM(latency_ms), 0)                           AS ms
                  FROM helix_infra.model_call
                 WHERE at >= ?
                 GROUP BY model_id
                 ORDER BY ms DESC
                """, (rs, i) -> {
            Map<String, Object> r = new java.util.LinkedHashMap<>();
            String model = rs.getString("model_id");
            r.put("modelId", model);
            r.put("label", prices.of(model).label());
            r.put("calls", rs.getLong("calls"));
            r.put("cached", rs.getLong("cached"));
            r.put("failed", rs.getLong("failed"));
            r.put("cases", rs.getLong("cases"));
            r.put("tokensIn", rs.getLong("tokens_in"));
            r.put("tokensOut", rs.getLong("tokens_out"));
            r.put("seconds", rs.getLong("ms") / 1000.0);
            r.put("cost", prices.of(model).cost(rs.getLong("tokens_in"), rs.getLong("tokens_out"), 0));
            return r;
        }, java.sql.Timestamp.from(since));

        java.math.BigDecimal total = java.math.BigDecimal.ZERO;
        long calls = 0, cached = 0;
        for (Map<String, Object> m : byModel) {
            total = total.add((java.math.BigDecimal) m.get("cost"));
            calls += (Long) m.get("calls");
            cached += (Long) m.get("cached");
        }
        Long cases = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT case_id) FROM helix_infra.model_call WHERE at >= ? AND case_id IS NOT NULL",
                Long.class, java.sql.Timestamp.from(since));
        long n = cases == null ? 0 : cases;

        // What the cache saved: cached rows carry the tokens the original call reported,
        // priced the same way. It is the one figure that says whether the cache is worth
        // having, and it can only be stated because a hit records what it avoided.
        java.math.BigDecimal avoided = jdbc.query("""
                SELECT model_id, COALESCE(SUM(prompt_tokens),0) AS tin,
                       COALESCE(SUM(completion_tokens),0) AS tout
                  FROM helix_infra.model_call
                 WHERE at >= ? AND status = 'CACHED'
                 GROUP BY model_id
                """, (rs, i) -> prices.of(rs.getString("model_id"))
                        .cost(rs.getLong("tin"), rs.getLong("tout"), 0),
                java.sql.Timestamp.from(since))
                .stream().reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("cost", total);
        out.put("costAvoided", avoided);
        out.put("cases", n);
        out.put("costPerCase", n == 0 ? java.math.BigDecimal.ZERO
                : total.divide(java.math.BigDecimal.valueOf(n), 6, java.math.RoundingMode.HALF_UP));
        out.put("calls", calls);
        out.put("cachedPct", calls == 0 ? 0 : Math.round((cached * 100.0) / calls));
        out.put("byModel", byModel);
        return out;
    }

    /** An error message is a note, not an essay — a stack trace here helps nobody. */
    private static String trim(String error) {
        if (error == null) return null;
        return error.length() <= 500 ? error : error.substring(0, 500);
    }
}
