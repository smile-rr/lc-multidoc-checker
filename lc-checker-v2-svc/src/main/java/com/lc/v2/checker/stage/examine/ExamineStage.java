package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.lc.LcConsistencyWarning;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.ExamineContext;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator.Outcome;
import com.lc.v2.checker.infra.rules.RuleTriggerEvaluator.TriggerDecision;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 3 — Examine.
 *
 * Each catalog rule is evaluated through {@link RuleTriggerEvaluator}:
 *   FIRE           → dispatch to SpelEvaluator (PROGRAMMATIC) or AgentRuleExecutor (AGENT)
 *   NOT_APPLICABLE → emit a NA row with the trigger trace as explanation (visible to officer)
 *   SKIP           → drop silently (rule's doc universe absent)
 *
 * Trigger traces are persisted in pipeline_steps(examine/meta).trigger_traces for UI tooltips.
 */
@PipelineStage(name = "examine")
@Component
public class ExamineStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ExamineStage.class);

    private final RuleCatalogRegistry catalog;
    private final SpelEvaluator spelEvaluator;
    private final AgentRuleExecutor agentExecutor;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper;
    private final RuleTriggerEvaluator triggerEvaluator;
    private final LcRulePlannerAgent plannerAgent;
    private final com.lc.v2.checker.stage.parse.Mt700Parser mt700Parser;

    private final Map<String, List<String>> traces = new LinkedHashMap<>();

    public ExamineStage(RuleCatalogRegistry catalog,
                        SpelEvaluator spelEvaluator,
                        AgentRuleExecutor agentExecutor,
                        SessionStore sessionStore,
                        ObjectMapper objectMapper,
                        RuleTriggerEvaluator triggerEvaluator,
                        LcRulePlannerAgent plannerAgent,
                        com.lc.v2.checker.stage.parse.Mt700Parser mt700Parser) {
        this.catalog = catalog;
        this.spelEvaluator = spelEvaluator;
        this.agentExecutor = agentExecutor;
        this.sessionStore = sessionStore;
        this.objectMapper = objectMapper;
        this.triggerEvaluator = triggerEvaluator;
        this.plannerAgent = plannerAgent;
        this.mt700Parser = mt700Parser;
    }

    @Override
    public String name() { return "examine"; }

    @Override
    public void execute(StageContext ctx) {
        long start = System.currentTimeMillis();
        ctx.eventBus.stageStarted(ctx.sessionId, "examine");
        traces.clear();

        // Phase timings — emitted as ExaminePhase SSE events so the UI phase strip
        // can render reliably without inferring from rule-count thresholds.
        Map<String, Long> phaseStarts = new LinkedHashMap<>();
        long deriveStart = System.currentTimeMillis();
        phaseStarts.put("derive", deriveStart);

        // Step 0a: rehydrate ctx.lc from v_lc_parse if the in-memory copy
        // was lost (JVM restart, stage-cache eviction). Without this, every
        // field-dependent rule returns NOT_APPLICABLE because the envelope
        // appears empty.
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

        // Step 0b: refresh derived LC envelope. Examine "owns" derive→plan→check
        // as one unit, so a re-examine reflects any LC text edits without needing
        // a Parse-stage rerun.
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

        long deriveEnd = System.currentTimeMillis();
        ctx.eventBus.examinePhase(ctx.sessionId, "derive", deriveEnd - deriveStart, null, null);
        phaseStarts.put("plan", deriveEnd);

        // Step 1: build trigger-evaluation context.
        ExamineContext ec = buildContext(ctx);
        log.info("[{}] Examine context: presentedDocs={}, lcFields={}, derivedKeys={}, consistencyMarks={}",
                ctx.sessionId, ec.presentedDocTypes(),
                ec.lcFields() == null ? 0 : ec.lcFields().size(),
                ec.lcDerived() == null ? 0 : ec.lcDerived().size(),
                ec.consistencyClauses() == null ? 0 : ec.consistencyClauses().size());

        // Step 2: fan out — planner future runs in parallel with PROGRAMMATIC catalog evaluation.
        CompletableFuture<List<Rule>> plannerFuture = CompletableFuture.supplyAsync(
                () -> safePlannerCall(ctx, ec));

        // Step 3: classify catalog rules; PROGRAMMATIC rules run inline now,
        // AGENT rules deferred to a queue that drains after planner joins.
        List<Rule> toFireProg = new ArrayList<>();
        List<Rule> toFireAgent = new ArrayList<>();
        List<RuleAndDecision> naList = new ArrayList<>();
        List<RuleAndDecision> skipList = new ArrayList<>();
        for (Rule rule : catalog.enabledRules()) {
            classify(rule, ec, toFireProg, toFireAgent, naList, skipList);
        }

        // Step 4: NA rows first (catalog order); then PROGRAMMATIC rules.
        List<Rule> adhocRules = plannerFuture.join();
        List<RuleAndDecision> adhocNa = new ArrayList<>();
        for (Rule r : adhocRules) classify(r, ec, toFireProg, toFireAgent, adhocNa, skipList);

        long planEnd = System.currentTimeMillis();
        ctx.eventBus.examinePhase(ctx.sessionId, "plan",
                planEnd - phaseStarts.get("plan"), null, adhocRules.size());
        phaseStarts.put("check", planEnd);

        int total = naList.size() + adhocNa.size() + toFireProg.size() + toFireAgent.size();
        int[] idx = {0};

        ctx.eventBus.examinePhase(ctx.sessionId, "check", 0L, total, null);

        // Pre-insert PENDING rows so the worklist materialises immediately. Each row
        // gets upserted in place when the rule actually completes. SKIPs are not
        // pre-inserted — they emit synthetic [OUT_OF_SCOPE] NA rows via emitSkipped.
        for (Rule rule : toFireProg) upsertPendingRow(ctx, rule);
        for (Rule rule : toFireAgent) upsertPendingRow(ctx, rule);
        for (RuleAndDecision rad : naList) upsertPendingRow(ctx, rad.rule());
        for (RuleAndDecision rad : adhocNa) upsertPendingRow(ctx, rad.rule());

        for (RuleAndDecision rad : naList) emitNa(ctx, rad, ++idx[0], total);
        for (RuleAndDecision rad : adhocNa) emitNa(ctx, rad, ++idx[0], total);
        for (Rule rule : toFireProg) runRule(ctx, rule, ++idx[0], total);
        // Step 5: AGENT batch — single virtual queue drains catalog + adhoc together.
        for (Rule rule : toFireAgent) runRule(ctx, rule, ++idx[0], total);
        // Out-of-scope rows: surface SKIPs as synthetic NA rows so the worklist's
        // Out-of-Scope section has content (UI keys on the [OUT_OF_SCOPE] prefix).
        for (RuleAndDecision rad : skipList) emitSkipped(ctx, rad);

        log.info("[{}] Examine: {} fire-prog, {} fire-agent, {} NA, {} adhoc-proposed",
                ctx.sessionId, toFireProg.size(), toFireAgent.size(),
                naList.size() + adhocNa.size(), adhocRules.size());

        // Step 6: persist meta sections (examine array is now built progressively).
        persistResults(ctx, adhocRules);

        ctx.eventBus.examinePhase(ctx.sessionId, "review",
                System.currentTimeMillis() - phaseStarts.get("check"), null, null);

        ctx.eventBus.stageCompleted(ctx.sessionId, "examine", System.currentTimeMillis() - start);
        log.info("[{}] Examine complete: {} results, {}ms",
                ctx.sessionId, ctx.checkResults.size(), System.currentTimeMillis() - start);
    }

    private List<Rule> safePlannerCall(StageContext ctx, ExamineContext ec) {
        try {
            return plannerAgent.propose(ctx, ec);
        } catch (Exception e) {
            log.warn("[{}] planner failed: {}", ctx.sessionId, e.getMessage());
            return List.of();
        }
    }

    private void classify(Rule rule, ExamineContext ec,
                          List<Rule> prog, List<Rule> agent,
                          List<RuleAndDecision> na, List<RuleAndDecision> skip) {
        TriggerDecision d = triggerEvaluator.evaluate(rule, ec);
        traces.put(rule.ruleId(), d.trace());
        switch (d.outcome()) {
            case FIRE -> {
                if (rule.isProgrammatic()) prog.add(rule); else agent.add(rule);
                log.debug("rule {} FIRE: {}", rule.ruleId(), firstReason(d.trace()));
            }
            case NOT_APPLICABLE -> {
                na.add(new RuleAndDecision(rule, d));
                log.debug("rule {} NA: {}", rule.ruleId(), firstReason(d.trace()));
            }
            case SKIP -> {
                skip.add(new RuleAndDecision(rule, d));
                log.info("rule {} SKIP: {}", rule.ruleId(), firstReason(d.trace()));
            }
        }
    }

    private void emitNa(StageContext ctx, RuleAndDecision rad, int idx, int total) {
        Rule rule = rad.rule();
        ctx.eventBus.ruleStarted(ctx.sessionId, rule.ruleId(), rule.ruleId(),
                idx, total, rule.checkType());
        CheckResult result = new CheckResult(rule.ruleId(),
                CheckResult.Verdict.NOT_APPLICABLE,
                String.join("; ", rad.decision().trace()),
                null, 1.0, rule.checkType());
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
        ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                result.verdict().name(), result.confidence(),
                rule.origin().name(), "NOT_APPLICABLE", rad.decision().trace());
    }

    /** Synthetic NOT_APPLICABLE row for SKIP'd rules so the worklist's
     *  Out-of-Scope section has content. The {@code [OUT_OF_SCOPE]} prefix
     *  is what the UI keys on to route the row out of the Active group. */
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
            log.error("[{}] Rule {} error: {}", ctx.sessionId, rule.ruleId(), e.getMessage());
            result = new CheckResult(rule.ruleId(), CheckResult.Verdict.DOUBTS,
                    "Evaluation error: " + e.getMessage(), null, 0.0, rule.checkType());
        }
        ctx.checkResults.add(result);
        appendCheckResult(ctx, result);
        List<String> trace = traces.getOrDefault(rule.ruleId(), List.of());
        ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                result.verdict().name(), result.confidence(),
                rule.origin().name(), "FIRE", trace);
    }

    private void appendCheckResult(StageContext ctx, CheckResult r) {
        try {
            Map<String, Object> stepResult = new LinkedHashMap<>();
            stepResult.put("check_type", r.checkType() != null ? r.checkType() : "");
            stepResult.put("explanation", r.explanation() != null ? r.explanation() : "");
            stepResult.put("confidence", r.confidence());
            stepResult.put("trigger_trace", traces.getOrDefault(r.ruleId(), List.of()));
            sessionStore.upsertPipelineStep(ctx.sessionId, "examine", r.ruleId(),
                    r.verdict().name(), objectMapper.writeValueAsString(stepResult),
                    null, null);
        } catch (Exception e) {
            log.warn("[{}] persist examine row failed for {}: {}",
                    ctx.sessionId, r.ruleId(), e.getMessage());
        }
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
            log.warn("[{}] pre-insert PENDING row failed for {}: {}",
                    ctx.sessionId, rule.ruleId(), e.getMessage());
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
            // In-memory ctx.extracts can be empty if Examine runs after a JVM restart
            // (the StageContext cache is wiped). Fall back to the documents table so
            // the officer at least sees which rules were considered.
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

    /**
     * Map LcConsistencyChecker warnings to per-clause status. Each warning code
     * is associated with the LC fields whose values contradicted; those fields
     * are stamped CONTRADICTORY:&lt;description&gt;. Other fields default to OK
     * (callers that read this map use {@code getOrDefault(field, "OK")}).
     */
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
                default -> { /* unknown code: no field mapping, surface in trace via ConsistencyOk */ }
            }
        }
        return m;
    }

    private static String firstReason(List<String> trace) {
        return trace == null || trace.isEmpty() ? "" : trace.get(0);
    }

    private record RuleAndDecision(Rule rule, TriggerDecision decision) {}

    /**
     * Re-parse MT700 from {@code v_lc_parse} if ctx.lc is null. Deterministic;
     * cheap. Survives JVM restarts because IntakeStage persists the raw text
     * to pipeline_steps(intake/lc_parse).
     */
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

    private void persistResults(StageContext ctx, List<Rule> adhocRules) {
        // The examine[] array is built progressively via appendCheckResult — do not
        // re-serialise it here, that would create duplicate rows. Only meta lands now.
        try {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("trigger_traces", traces);
            meta.put("adhoc_rules", adhocRules);
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
