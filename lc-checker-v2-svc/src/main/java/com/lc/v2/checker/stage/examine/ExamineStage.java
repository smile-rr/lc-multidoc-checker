package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.lc.LcConsistencyWarning;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.DynamicCondition;
import com.lc.v2.checker.domain.rule.ExamineContext;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator.TriggerDecision;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
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
 *   NOT_APPLICABLE → emit NOT_APPLICABLE with the trigger trace as reason
 *                    (W5 contract — see docs/architecture/rule-set.md §1).
 *                    Missing-required-doc as a discrepancy is owned exclusively
 *                    by DOCSET-01; every other rule that needed the missing
 *                    doc as input records NOT_APPLICABLE here, never FAIL.
 *   SKIP           → emit NOT_APPLICABLE marked OUT_OF_SCOPE.
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
    private final ConditionDecomposer conditionDecomposer;
    private final Tracer tracer;

    private final Map<String, List<String>> traces = new LinkedHashMap<>();
    private final Map<String, Long> ruleStartMs = new LinkedHashMap<>();

    public ExamineStage(RuleCatalogRegistry catalog,
                        SpelEvaluator spelEvaluator,
                        AgentRuleExecutor agentExecutor,
                        SessionStore sessionStore,
                        ObjectMapper objectMapper,
                        RuleTriggerEvaluator triggerEvaluator,
                        com.lc.v2.checker.stage.parse.Mt700Parser mt700Parser,
                        ConditionDecomposer conditionDecomposer,
                        Tracer tracer) {
        this.catalog = catalog;
        this.spelEvaluator = spelEvaluator;
        this.agentExecutor = agentExecutor;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
        this.triggerEvaluator = triggerEvaluator;
        this.mt700Parser = mt700Parser;
        this.conditionDecomposer = conditionDecomposer;
        this.tracer = tracer;
    }

    @Override
    public String name() { return "examine"; }

    @Override
    @PipelineStage
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

        // Step 2: classify rules, then order by execution tier so the cheap
        // deterministic ones run first and the expensive LLM-bound ones run last.
        // Order: PROGRAMMATIC → AGENT → AGENT_TOOL → AGENTIC.
        // Within the same tier, catalog order is preserved (stable sort).
        // Officer benefit: PROG verdicts populate the worklist instantly; AGENT
        // calls stream in afterwards; AGENTIC :47A: runs last via the dedicated
        // runDynamicConditions step. NA rows ride alongside FIRE rows in the
        // same tier so the worklist still advances sequentially within a group.
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
        classified.sort(java.util.Comparator.comparingInt(c -> tierOrder(c.rule().checkType())));

        int total = totalActive;
        int[] idx = {0};

        // Pre-insert PENDING rows so the worklist materialises immediately.
        for (Classified c : classified) upsertPendingRow(ctx, c.rule());

        // The @PipelineStage aspect opened the "examine" span and attached
        // session tags; child rule.* observations from AgentRuleExecutor
        // (and their gen_ai.* grandchildren from Spring AI) nest correctly
        // because tracer.withSpan is the active scope. We only add a dynamic
        // tag for the fire-rule count.
        long fireRules = classified.stream()
                .filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.FIRE).count();
        Span stageSpan = tracer.currentSpan();
        if (stageSpan != null) stageSpan.tag("rules.fire", String.valueOf(fireRules));

        // Catalog-order execution — NA emitted in place, no block hopping.
        for (Classified c : classified) {
            if (c.outcome() == RuleTriggerEvaluator.Outcome.FIRE) {
                runRule(ctx, c.rule(), ++idx[0], total);
            } else {
                emitNa(ctx, c.rad(), ++idx[0], total);
            }
        }
        // Out-of-scope rows surface as synthetic NA rows for the worklist's
        // Out-of-Scope section.
        for (RuleAndDecision rad : skipList) emitSkipped(ctx, rad);

        long fireCount = classified.stream().filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.FIRE).count();
        long naCount = classified.stream().filter(c -> c.outcome() == RuleTriggerEvaluator.Outcome.NOT_APPLICABLE).count();
        log.info("[{}] Examine: {} fire, {} NA, {} skipped",
                ctx.sessionId, fireCount, naCount, skipList.size());

        // W6 — :47A: dynamic-condition decomposition + per-condition checks.
        runDynamicConditions(ctx, ec);

        persistResults(ctx);

        ctx.eventBus.stageCompleted(ctx.sessionId, "examine", System.currentTimeMillis() - start);
        log.info("[{}] Examine complete: {} results, {}ms",
                ctx.sessionId, ctx.checkResults.size(), System.currentTimeMillis() - start);
    }


    private void emitNa(StageContext ctx, RuleAndDecision rad, int idx, int total) {
        Rule rule = rad.rule();
        ctx.eventBus.ruleStarted(ctx.sessionId, rule.ruleId(), rule.ruleId(),
                idx, total, rule.checkType());
        // W5 contract — never silent skip, never auto-FAIL on missing input.
        // The missing-doc discrepancy itself is owned by DOCSET-01.
        String reason = String.join("; ", rad.decision().trace());
        String explanation = reason.isBlank()
                ? "Rule input not available — see DOCSET-01 for any missing-doc discrepancy"
                : reason + " — see DOCSET-01 for any missing-doc discrepancy";
        CheckResult result = new CheckResult(rule.ruleId(),
                CheckResult.Verdict.NOT_APPLICABLE,
                explanation,
                null, 1.0, rule.checkType());
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
        ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                result.verdict().name(), result.confidence(),
                "CATALOG", "INPUT_MISSING", rad.decision().trace());
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
        // W5: do NOT flip NA → FAIL. The system DOES auto-decide NA when inputs
        // are missing or LC pre-conditions empty. The discrepancy concern belongs
        // to DOCSET-01 (and the AGENT rule in question can still emit FAIL on its
        // own evidence-based judgement).
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

    /** Stable ordering for tier-sorted execution: PROG < AGENT < AGENT_TOOL < AGENTIC. */
    private static int tierOrder(String checkType) {
        if (checkType == null) return 99;
        return switch (checkType) {
            case "PROGRAMMATIC" -> 0;
            case "AGENT"        -> 1;
            case "AGENT_TOOL"   -> 2;
            case "AGENTIC"      -> 3;
            default             -> 99;
        };
    }

    private static String firstReason(List<String> trace) {
        return trace == null || trace.isEmpty() ? "" : trace.get(0);
    }

    private record RuleAndDecision(Rule rule, TriggerDecision decision) {}

    /**
     * W6 — decompose LC :47A: into atomic conditions and run each as an inline
     * AGENT check. Cached by content hash of (`:47A:` text + presented-doc set)
     * via a synthetic pipeline_steps row {@code stage='examine',step_key='cond_dyn:<hash>'}.
     * On cache hit the decomposition is reused; per-condition checks still run.
     */
    private void runDynamicConditions(StageContext ctx, ExamineContext ec) {
        if (ctx.lc == null) return;
        String lc47a = stringField(ctx.lc.envelope().get("additional_conditions"));
        if (lc47a == null || lc47a.isBlank()) return;
        String lc46a = stringField(ctx.lc.envelope().get("documents_required"));
        Set<String> presented = ec.presentedDocTypes();

        String cacheKey = ConditionDecomposer.cacheKey(lc47a, presented);
        List<DynamicCondition> conditions = loadCachedConditions(ctx.sessionId, cacheKey);
        if (conditions == null) {
            try {
                conditions = conditionDecomposer.decompose(lc47a, lc46a, presented);
            } catch (Exception e) {
                log.warn("[{}] COND-DYN decomposition threw: {}", ctx.sessionId, e.getMessage());
                conditions = List.of();
            }
            persistConditionsCache(ctx.sessionId, cacheKey, conditions);
        } else {
            log.info("[{}] COND-DYN cache hit ({}): {} cached conditions",
                    ctx.sessionId, cacheKey.substring(0, 8), conditions.size());
        }

        if (conditions.isEmpty()) return;

        int condIdx = 0;
        for (DynamicCondition c : conditions) {
            condIdx++;
            String stepKey = "dyn:" + c.id().substring(0, Math.min(12, c.id().length()));
            if (c.isOutOfScope()) {
                CheckResult naResult = new CheckResult(c.synthRuleId(),
                        CheckResult.Verdict.NOT_APPLICABLE,
                        "OUT_OF_SCOPE — " + truncate(c.checkPrompt(), 200),
                        null, 1.0, "AGENTIC");
                ctx.checkResults.add(naResult);
                appendDynamicResult(ctx, stepKey, c, naResult);
                continue;
            }
            Rule synth = synthesizeRule(c);
            CheckResult result;
            try {
                result = agentExecutor.execute(synth, ctx);
            } catch (Exception e) {
                log.error("[{}] dyn condition {} failed: {}", ctx.sessionId, stepKey, e.getMessage(), e);
                result = new CheckResult(c.synthRuleId(), CheckResult.Verdict.FAILED,
                        "Dynamic check error: " + e.getMessage(), null, 0.0, "AGENT");
            }
            // Stamp the result with the synth rule_id (executor returns the rule it received).
            ctx.checkResults.add(result);
            appendDynamicResult(ctx, stepKey, c, result);
            ctx.eventBus.ruleChecked(ctx.sessionId, c.synthRuleId(),
                    result.verdict().name(), result.confidence(),
                    "DYNAMIC", "DYN_47A", List.of("source: " + truncate(c.sourceText(), 120)));
        }
        log.info("[{}] COND-DYN ran {} dynamic condition check(s)", ctx.sessionId, condIdx);
    }

    private Rule synthesizeRule(DynamicCondition c) {
        // Synthetic rule for AgentRuleExecutor — bypasses the catalog (so the
        // rule_id pattern check does not apply; RuleCatalogRegistry is not
        // consulted for synth rules at runtime).
        return new Rule(
                c.synthRuleId(),
                "Dynamic :47A: " + truncate(c.sourceText(), 60),
                1, null,
                c.appliesToDocs(), c.appliesToDocs(), c.appliesToDocs(),
                List.of(),
                "AGENT",
                c.severity() == null ? "MAJOR" : c.severity(),
                "POSITIVE",
                true,
                c.ucpRefs(), c.isbpRefs(),
                null,
                c.checkPrompt(),
                List.of(),
                true,
                null,
                Boolean.FALSE,
                null,
                null);
    }

    private List<DynamicCondition> loadCachedConditions(String sessionId, String cacheKey) {
        try {
            String stepKey = "cond_dyn:" + cacheKey;
            String json = sessionStore.getPipelineStepResult(sessionId, "examine", stepKey);
            if (json == null || json.isBlank()) return null;
            JsonNode root = objectMapper.readTree(json);
            JsonNode arr = root.path("conditions");
            if (!arr.isArray()) return null;
            List<DynamicCondition> out = new ArrayList<>();
            for (JsonNode n : arr) {
                out.add(objectMapper.treeToValue(n, DynamicCondition.class));
            }
            return List.copyOf(out);
        } catch (Exception e) {
            log.warn("[{}] COND-DYN cache load failed: {}", sessionId, e.getMessage());
            return null;
        }
    }

    private void persistConditionsCache(String sessionId, String cacheKey, List<DynamicCondition> conditions) {
        try {
            String stepKey = "cond_dyn:" + cacheKey;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("cache_key", cacheKey);
            result.put("count", conditions.size());
            result.put("conditions", conditions);
            sessionStore.upsertPipelineStep(sessionId, "examine", stepKey,
                    "SUCCESS", objectMapper.writeValueAsString(result), null, null);
        } catch (Exception e) {
            log.warn("[{}] COND-DYN cache persist failed: {}", sessionId, e.getMessage());
        }
    }

    private void appendDynamicResult(StageContext ctx, String stepKey, DynamicCondition c, CheckResult r) {
        try {
            Map<String, Object> result = new LinkedHashMap<>();
            // Surface enough metadata that the joiner can build a proper
            // EnrichedRule without a catalog match. Without this, the worklist
            // shows the synth rule as "dyn:xxxxxxx · PROG · MINOR · <no name>".
            result.put("name", "Dynamic :47A: " + truncate(c.sourceText(), 80));
            result.put("check_type", r.checkType() != null ? r.checkType() : "AGENT");
            result.put("synth_rule_id", c.synthRuleId());
            result.put("source_text", c.sourceText());
            result.put("applies_to_docs", c.appliesToDocs());
            result.put("polarity", c.polarity());
            result.put("severity", c.severity() != null ? c.severity() : "MAJOR");
            result.put("check_kind", c.checkKind());
            result.put("ucp_refs", c.ucpRefs());
            result.put("isbp_refs", c.isbpRefs());
            result.put("verdict", r.verdict().name());
            result.put("explanation", r.explanation());
            result.put("confidence", r.confidence());
            sessionStore.upsertPipelineStep(ctx.sessionId, "examine", stepKey,
                    r.verdict().name(), objectMapper.writeValueAsString(result),
                    null, null);
        } catch (Exception e) {
            log.warn("[{}] dyn result persist failed for {}: {}", ctx.sessionId, stepKey, e.getMessage());
        }
    }

    private static String stringField(Object v) {
        if (v == null) return null;
        if (v instanceof Map<?, ?> m) v = m.get("value");
        return v == null ? null : v.toString();
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

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
