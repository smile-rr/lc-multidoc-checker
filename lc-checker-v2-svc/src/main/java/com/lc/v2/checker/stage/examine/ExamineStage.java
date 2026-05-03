package com.lc.v2.checker.stage.examine;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 3 — Examine.
 *
 * Loads 20 rules from the catalog, filters by triggerDocs, and dispatches each:
 *
 *   PROGRAMMATIC            → SpelEvaluator (SpEL expression, no LLM)
 *   AGENT / PROGRAMMATIC_AGENT → AgentRuleExecutor (Spring AI ChatClient)
 *
 * NOT_APPLICABLE short-circuit:
 *   - triggerDocs not all present in session → skip (rule silent)
 *   - lcFieldsRequired absent in LC → NOT_APPLICABLE result (not "skip")
 *
 * Results are emitted progressively via SSE (RuleChecked events) and written to
 * ctx.checkResults for SignoffStage aggregation and the officer confirmation UI.
 */
@PipelineStage(name = "examine")
@Component
public class ExamineStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ExamineStage.class);

    private final RuleCatalogRegistry catalog;
    private final SpelEvaluator spelEvaluator;
    private final AgentRuleExecutor agentExecutor;

    public ExamineStage(RuleCatalogRegistry catalog,
                        SpelEvaluator spelEvaluator,
                        AgentRuleExecutor agentExecutor) {
        this.catalog = catalog;
        this.spelEvaluator = spelEvaluator;
        this.agentExecutor = agentExecutor;
    }

    @Override
    public String name() { return "examine"; }

    @Override
    public void execute(StageContext ctx) {
        long start = System.currentTimeMillis();
        ctx.eventBus.stageStarted(ctx.sessionId, "examine");

        List<Rule> activeRules = catalog.enabledRules().stream()
                .filter(rule -> isTriggered(rule, ctx))
                .toList();
        log.info("[{}] Examine: {}/{} rules active for this session",
                ctx.sessionId, activeRules.size(), catalog.enabledRules().size());

        int total = activeRules.size();
        int idx = 0;
        for (Rule rule : activeRules) {
            idx++;
            ctx.eventBus.ruleStarted(ctx.sessionId, rule.ruleId(), rule.ruleId(),
                    idx, total, rule.checkType());
            CheckResult result;
            try {
                if (!lcFieldsPresent(rule, ctx)) {
                    result = new CheckResult(rule.ruleId(), CheckResult.Verdict.NOT_APPLICABLE,
                            "LC field absent: " + String.join(", ", rule.lcFieldsRequired()),
                            null, 1.0, rule.checkType());
                } else if (rule.isProgrammatic()) {
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
            ctx.eventBus.ruleChecked(ctx.sessionId, rule.ruleId(),
                    result.verdict().name(), result.confidence());
            log.debug("[{}] {} → {} (conf={})", ctx.sessionId, rule.ruleId(),
                    result.verdict(), result.confidence());
        }

        ctx.eventBus.stageCompleted(ctx.sessionId, "examine", System.currentTimeMillis() - start);
        log.info("[{}] Examine complete: {} results, {}ms",
                ctx.sessionId, ctx.checkResults.size(), System.currentTimeMillis() - start);
    }

    /** Rule fires only when ALL its triggerDocs have been extracted in this session. */
    private boolean isTriggered(Rule rule, StageContext ctx) {
        return rule.triggerDocs().stream().allMatch(name -> {
            try {
                return ctx.extracts.containsKey(DocType.valueOf(name));
            } catch (IllegalArgumentException e) {
                log.warn("Unknown triggerDoc '{}' in rule {}", name, rule.ruleId());
                return false;
            }
        });
    }

    /** Rule is NOT_APPLICABLE when any lcFieldsRequired key is absent in the LC envelope. */
    private boolean lcFieldsPresent(Rule rule, StageContext ctx) {
        if (rule.lcFieldsRequired().isEmpty()) return true;
        if (ctx.lc == null) return false;
        return rule.lcFieldsRequired().stream().allMatch(key -> ctx.lc.envelope().has(key));
    }
}
