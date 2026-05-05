package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.lc.LcConsistencyWarning;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.ExamineContext;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.observability.TraceNames;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator.TriggerDecision;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 3 — Examine.
 *
 * Each catalog rule is evaluated through {@link RuleTriggerEvaluator}:
 *   FIRE           → dispatch to SpelEvaluator (PROGRAMMATIC) or AgentRuleExecutor (AGENT/AGENT_TOOL/AGENTIC)
 *   NOT_APPLICABLE → emit FAIL with "Required data missing" (system never auto-decides N/A)
 *   SKIP           → drop silently (rule's doc universe absent) — surfaced as out-of-scope row
 */
@Component
public class ExamineStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ExamineStage.class);

    private final RuleCatalogRegistry catalog;
    private final SpelEvaluator spelEvaluator;
    private final AgentRuleExecutor agentExecutor;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;
    private final RuleTriggerEvaluator triggerEvaluator;
    private final com.lc.v2.checker.stage.parse.Mt700Parser mt700Parser;
    private final Tracer tracer;
    private final ObservationRegistry observationRegistry;

    private final Map<String, List<String>> traces = new LinkedHashMap<>();
    private final Map<String, Long> ruleStartMs = new LinkedHashMap<>();

    public ExamineStage(RuleCatalogRegistry catalog,
                        SpelEvaluator spelEvaluator,
                        AgentRuleExecutor agentExecutor,
                        SessionStore sessionStore,
                        ObjectMapper objectMapper,
                        RuleTriggerEvaluator triggerEvaluator,
                        com.lc.v2.checker.stage.parse.Mt700Parser mt700Parser,
                        Tracer tracer,
                        ObservationRegistry observationRegistry) {
        this.catalog = catalog;
        this.spelEvaluator = spelEvaluator;
        this.agentExecutor = agentExecutor;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
        this.triggerEvaluator = triggerEvaluator;
        this.mt700Parser = mt700Parser;
        this.tracer = tracer;
        this.observationRegistry = observationRegistry;
    }

    @Override
    public String name() { return "examine"; }

    @Override
    public void execute(StageContext ctx) {
        long start = System.currentTimeMillis();
        ctx.eventBus.stageStarted(ctx.sessionId, "examine");
        traces.clear();

        // Step 0a: rehydrate ctx.lc from v_lc_parse if the in-memory copy was lost
        // (JVM restart, stage-cache eviction). Without this, every field-dependent
        // rule returns NOT_APPLICABLE because the envelope appears empty.
        if (ctx.lc == null) {
            try {
                ctx.lc = rehydrateLc(ctx.sessionId);
                if (ctx.lc != null) {
                    log.info("[{}] Examine rehydrated LC from v_lc_parse: #{} ",
                            ctx.sessionId, ctx.lc.getLcNumber());
                }
            } catch (Exception e) {
                log.warn("[{}] Examine LC rehydrate failed: {}", ctx.sessionId, e.getMessage());
            }
        }

        // Step 0b: refresh derived LC envelope so re-examines reflect any LC text
        // edits without needing a Parse-stage rerun.
        if (ctx.lc != null) {
            try {
                com.lc.v2.checker.domain.lc.LcDerived fresh =
                        com.lc.v2.checker.stage.parse.Mt700Parser.deriveFromRaw(
                                ctx.lc.rawFields(), ctx.lc.envelope());
                ctx.lc = ctx.lc.withDerived(fresh);
                log.info("[{}] Examine re-derived LC: incoterms={} tolerance={}/{} tenor={}",
                        ctx.sessionId, fresh.incotermsClass(),
                        fresh.effectiveTolerance().pct(), fresh.effectiveTolerance().mode(),
                        fresh.tenorClass());
            } catch (Exception e) {
                log.warn("[{}] Examine re-derive failed: {}", ctx.sessionId, e.getMessage());
            }
        } else {
            log.warn("[{}] Examine: ctx.lc still null after rehydrate attempt — "
                    + "field-dependent rules will return NOT_APPLICABLE", ctx.sessionId);
        }

        // Step 1: build trigger-evaluation context.
        ExamineContext ec = buildContext(ctx);
        log.info("[{}] Examine context: presentedDocs={}, lcFields={}, derivedKeys={}, consistencyMarks={}",
                ctx.sessionId, ec.presentedDocTypes(),
                ec.lcFields() == null ? 0 : ec.lcFields().size(),
                ec.lcDerived() == null ? 0 : ec.lcDerived().size(),
                ec.consistencyClauses() == null ? 0 : ec.consistencyClauses().size());

        // Step 2: classify rules — preserve catalog order across NA / FIRE / SKIP
        // so the worklist, progress meter and execution all advance sequentially
        // (no NA-block-then-FIRE-block jump).
        record Classified(Rule rule, RuleTriggerEvaluator.Outcome outcome, RuleAndDecision rad) {}
        List<Classified> classified = new ArrayList<>();
        List<RuleAndDecision> skipList = new ArrayList<>();
        int totalActive = 0;
        for (Rule rule : catalog.enabledRules()) {
            TriggerDecision d = triggerEvaluator.evaluate(rule, ec);
            traces.put(rule.ruleId(), d.trace());
            switch (d.outcome()) {
                case FIRE -> { classified.add(new Classified(rule, d.outcome(), null)); totalActive++; }
                case NOT_APPLICABLE -> { classified.add(new Classified(rule, d.outcome(), new RuleAndDecision(rule, d))); totalActive++; }
                case SKIP -> skipList.add(new RuleAndDecision(rule, d));
            }
        }

        int total = totalActive;
        int[] idx = {0};

        // Pre-insert PENDING rows so the worklist materialises immediately.
        for (Classified c : classified) upsertPendingRow(ctx, c.rule());

        // Stage span groups every AGENT/AGENT_TOOL/AGENTIC ChatClient call
        // (Spring AI auto-emits gen_ai.* observations) under a single
        // "examine" node in Langfuse. Inherits session root via the scope
        // set by PipelineService.runStageAsync.
        long fireRules = classified.stream()
                .filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.FIRE).count();
        // Observation-based scope so child rule.* observations (and their
        // gen_ai.* grandchildren from Spring AI) nest correctly in Langfuse.
        Observation examineObs = Observation.createNotStarted("examine", observationRegistry)
                .lowCardinalityKeyValue("rules.fire", String.valueOf(fireRules))
                .start();
        try (Observation.Scope scope = examineObs.openScope()) {
            Span s = tracer.currentSpan();
            if (s != null) {
                s.tag("session.id", ctx.sessionId);
                s.tag("langfuse.session.id", ctx.sessionId);
                s.tag("langfuse.trace.name", TraceNames.forSession(ctx.sessionId));
                s.tag("rules.fire", String.valueOf(fireRules));
            }
            // Catalog-order execution — NA emitted in place, no block hopping.
            for (Classified c : classified) {
                if (c.outcome() == RuleTriggerEvaluator.Outcome.FIRE) {
                    runRule(ctx, c.rule(), ++idx[0], total);
                } else {
                    emitNa(ctx, c.rad(), ++idx[0], total);
                }
            }
        } catch (Throwable t) {
            examineObs.error(t);
            throw t;
        } finally {
            examineObs.stop();
        }
        // Out-of-scope rows surface as synthetic NA rows for the worklist's
        // Out-of-Scope section.
        for (RuleAndDecision rad : skipList) emitSkipped(ctx, rad);

        long fireCount = classified.stream().filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.FIRE).count();
        long naCount = classified.stream().filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.NOT_APPLICABLE).count();
        log.info("[{}] Examine: {} fire, {} NA, {} skipped",
                ctx.sessionId, fireCount, naCount, skipList.size());

        persistResults(ctx);

        ctx.eventBus.stageCompleted(ctx.sessionId, "examine", System.currentTimeMillis() - start);
        log.info("[{}] Examine complete: {} results, {}ms",
                ctx.sessionId, ctx.checkResults.size(), System.currentTimeMillis() - start);
    }


    private void emitNa(StageContext ctx, RuleAndDecision rad, int idx, int total) {
        Rule rule = rad.rule();
        ctx.eventBus.ruleStarted(ctx.sessionId, rule.ruleId(), rule.ruleId(),
                idx, total, rule.checkType());
        String reason = String.join("; ", rad.decision().trace());
        String explanation = "Required data missing — " + (reason.isBlank()
                ? "rule prerequisites not met" : reason);
        CheckResult result = new CheckResult(rule.ruleId(),
                CheckResult.Verdict.FAIL,
                explanation,
                null, 1.0, rule.checkType());
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
        ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                result.verdict().name(), result.confidence(),
                "CATALOG", "MISSING_REQUIRED", rad.decision().trace());
    }

    private void emitSkipped(StageContext ctx, RuleAndDecision rad) {
        Rule rule = rad.rule();
        String reason = String.join("; ", rad.decision().trace());
        CheckResult result = new CheckResult(rule.ruleId(),
                CheckResult.Verdict.NOT_APPLICABLE,
                "[OUT_OF_SCOPE] " + reason,
                null, 1.0, rule.checkType());
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
    }

    private void runRule(StageContext ctx, Rule rule, int idx, int total) {
        ruleStartMs.put(rule.ruleId(), System.currentTimeMillis());
        ctx.eventBus.ruleStarted(ctx.sessionId, rule.ruleId(), rule.ruleId(),
                idx, total, rule.checkType());
        CheckResult result;
        try {
            if (rule.isProgrammatic()) {
                result = spelEvaluator.evaluate(rule, ctx);
            } else {
                result = agentExecutor.execute(rule, ctx);
            }
        } catch (Exception e) {
            log.error("[{}] Rule {} error: {}", ctx.sessionId, rule.ruleId(), e.getMessage(), e);
            result = new CheckResult(rule.ruleId(), CheckResult.Verdict.FAILED,
                    "Evaluation error: " + e.getClass().getSimpleName() + ": " + e.getMessage(),
                    null, 0.0, rule.checkType());
        }
        result = flipSystemNa(result);
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
        List<String> trace = traces.getOrDefault(rule.ruleId(), List.of());
        ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                result.verdict().name(), result.confidence(),
                "CATALOG", "FIRE", trace);
    }

    private void appendCheckResult(StageContext ctx, CheckResult r) {
        try {
            Long durationMs = computeDuration(r.ruleId());
            Map<String, Object> stepResult = new LinkedHashMap<>();
            stepResult.put("check_type", r.checkType() != null ? r.checkType() : "");
            stepResult.put("explanation", r.explanation() != null ? r.explanation() : "");
            stepResult.put("confidence", r.confidence());
            stepResult.put("duration_ms", durationMs);
            stepResult.put("trigger_trace", traces.getOrDefault(r.ruleId(), List.of()));
            if (r.toolCalls() != null && !r.toolCalls().isEmpty()) {
                stepResult.put("tool_calls", r.toolCalls());
            }
            if (r.conditionResults() != null && !r.conditionResults().isEmpty()) {
                stepResult.put("condition_results", r.conditionResults());
            }
            sessionStore.upsertPipelineStep(ctx.sessionId, "examine", r.ruleId(),
                    r.verdict().name(), objectMapper.writeValueAsString(stepResult),
                    durationMs, null);
        } catch (Exception e) {
            log.error("[{}] persist examine row failed for {}: {}",
                    ctx.sessionId, r.ruleId(), e.getMessage(), e);
            ctx.eventBus.ruleChecked(ctx.sessionId, r.ruleId(),
                    "FAILED", 0.0, "CATALOG", "PERSIST_ERROR",
                    List.of("persist error: " + e.getClass().getSimpleName() + ": " + e.getMessage()));
        }
    }

    private static CheckResult flipSystemNa(CheckResult r) {
        if (r == null || r.verdict() != CheckResult.Verdict.NOT_APPLICABLE) return r;
        String prior = r.explanation() == null ? "" : r.explanation().trim();
        String stripped = prior
                .replaceFirst("(?i)^not[_ ]applicable\\s*[\\u2014\\-:]\\s*", "")
                .replaceFirst("(?i)^n/a\\s*[\\u2014\\-:]\\s*", "");
        String explanation = "Required data missing — " + (stripped.isBlank()
                ? "rule prerequisites not met" : stripped);
        return new CheckResult(r.ruleId(), CheckResult.Verdict.FAIL, explanation,
                r.evidence(), r.confidence(), r.checkType(),
                r.toolCalls(), r.conditionResults());
    }

    private Long computeDuration(String ruleId) {
        Long start = ruleStartMs.get(ruleId);
        return start != null ? Math.max(0L, System.currentTimeMillis() - start) : null;
    }

    private void upsertPendingRow(StageContext ctx, Rule rule) {
        try {
            Map<String, Object> stepResult = new LinkedHashMap<>();
            stepResult.put("check_type", rule.checkType());
            stepResult.put("explanation", "");
            stepResult.put("confidence", null);
            sessionStore.upsertPipelineStep(ctx.sessionId, "examine", rule.ruleId(),
                    "PENDING", objectMapper.writeValueAsString(stepResult),
                    null, null);
        } catch (Exception e) {
            log.error("[{}] pre-insert PENDING row failed for {}: {}",
                    ctx.sessionId, rule.ruleId(), e.getMessage(), e);
            throw new IllegalStateException(
                    "Cannot pre-insert PENDING row for " + rule.ruleId()
                            + " — examine cannot proceed: " + e.getMessage(), e);
        }
    }

    private ExamineContext buildContext(StageContext ctx) {
        Map<String, Object> lcFields = ctx.lc != null
                ? ctx.lc.envelope().fields() : Map.of();
        Map<String, Object> lcDerived = (ctx.lc != null && ctx.lc.derived() != null)
                ? ctx.lc.derived().asMap() : Map.of();
        Set<String> presented = ctx.extracts.keySet().stream()
                .map(DocType::name).collect(Collectors.toUnmodifiableSet());
        if (presented.isEmpty()) {
            Set<String> fromDb = sessionStore.getDocuments(ctx.sessionId).stream()
                    .map(d -> (String) d.get("doc_type"))
                    .filter(t -> t != null && !"UNKNOWN".equals(t) && !"LC".equals(t))
                    .collect(Collectors.toUnmodifiableSet());
            if (!fromDb.isEmpty()) {
                log.warn("[{}] ctx.extracts empty — using DB documents as presented set: {}",
                        ctx.sessionId, fromDb);
                presented = fromDb;
            }
        }
        Map<String, String> consistencyClauses = consistencyClauseMap(ctx);
        return new ExamineContext(lcFields, lcDerived, presented, consistencyClauses);
    }

    private Map<String, String> consistencyClauseMap(StageContext ctx) {
        if (ctx.lc == null || ctx.lc.consistencyWarnings().isEmpty()) return Map.of();
        Map<String, String> m = new LinkedHashMap<>();
        for (LcConsistencyWarning w : ctx.lc.consistencyWarnings()) {
            String contradictory = "CONTRADICTORY:" + w.description();
            switch (w.code()) {
                case "LC_SHIP_AFTER_EXPIRY" -> {
                    m.put("latest_shipment_date", contradictory);
                    m.put("expiry_date", contradictory);
                }
                case "LC_TRANSHIPMENT_CONFLICT" -> {
                    m.put("transhipment", contradictory);
                    m.put("port_of_loading", contradictory);
                    m.put("port_of_discharge", contradictory);
                }
                default -> { /* unknown code */ }
            }
        }
        return m;
    }

    private static String firstReason(List<String> trace) {
        return trace == null || trace.isEmpty() ? "" : trace.get(0);
    }

    private record RuleAndDecision(Rule rule, TriggerDecision decision) {}

    private com.lc.v2.checker.domain.lc.LcParseResult rehydrateLc(String sessionId) {
        Map<String, Object> view = sessionStore.getLcParse(sessionId);
        if (view == null) return null;
        Object raw = view.get("raw_mt700");
        if (!(raw instanceof String s) || s.isBlank()) return null;
        try {
            return mt700Parser.parse(s);
        } catch (Exception e) {
            log.warn("[{}] LC rehydrate parse failed: {}", sessionId, e.getMessage());
            return null;
        }
    }

    private void persistResults(StageContext ctx) {
        try {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("trigger_traces", traces);
            if (ctx.lc != null && !ctx.lc.consistencyWarnings().isEmpty()) {
                meta.put("consistency", ctx.lc.consistencyWarnings());
            }
            sessionStore.upsertPipelineStep(ctx.sessionId, "examine", "meta",
                    "SUCCESS", objectMapper.writeValueAsString(meta), null, null);
        } catch (Exception e) {
            log.warn("[{}] examine persistence failed: {}", ctx.sessionId, e.getMessage());
        }
    }
}
