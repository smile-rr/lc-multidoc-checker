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
                SELECT model_id, family, role, kind,
                       COUNT(*)                                        AS calls,
                       COUNT(*) FILTER (WHERE status = 'CACHED')       AS cached,
                       COUNT(*) FILTER (WHERE status IN ('FAILED', 'TIMEOUT')) AS failed,
                       COALESCE(SUM(prompt_tokens), 0)                 AS tokens_in,
                       COALESCE(SUM(completion_tokens), 0)             AS tokens_out,
                       COALESCE(SUM(cached_prompt_tokens), 0)          AS tokens_cached,
                       COALESCE(SUM(latency_ms), 0)                    AS ms
                  FROM helix_infra.model_call
                 WHERE case_id = ?::uuid
                 GROUP BY model_id, family, role, kind
                 ORDER BY ms DESC
                """, (rs, i) -> {
            Map<String, Object> r = new java.util.LinkedHashMap<>();
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

    /** An error message is a note, not an essay — a stack trace here helps nobody. */
    private static String trim(String error) {
        if (error == null) return null;
        return error.length() <= 500 ? error : error.substring(0, 500);
    }
}
