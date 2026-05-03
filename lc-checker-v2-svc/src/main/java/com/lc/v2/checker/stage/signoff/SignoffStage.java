package com.lc.v2.checker.stage.signoff;

import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.infra.observability.PipelineStage;
import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Stage 4 — Sign-off.
 *
 * Aggregates all rule CheckResults into a final compliance decision:
 *   compliant = true  ↔  zero FAIL, zero DOUBTS
 *   compliant = false ↔  one or more FAIL or DOUBTS
 *
 * Stores the final report in ctx.finalReport (serialized to DB by PipelineService).
 * Officer disposition UI, MT734 template, and session freeze are post-POC extensions.
 */
@PipelineStage(name = "signoff")
@Component
public class SignoffStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(SignoffStage.class);

    @Override
    public String name() { return "signoff"; }

    @Override
    public void execute(StageContext ctx) {
        long start = System.currentTimeMillis();
        ctx.eventBus.stageStarted(ctx.sessionId, "signoff");

        List<CheckResult> results = ctx.checkResults;
        long failCount   = results.stream().filter(r -> r.verdict() == CheckResult.Verdict.FAIL).count();
        long doubtsCount = results.stream().filter(r -> r.verdict() == CheckResult.Verdict.DOUBTS).count();
        long passCount   = results.stream().filter(r -> r.verdict() == CheckResult.Verdict.PASS).count();
        long naCount     = results.stream().filter(r -> r.verdict() == CheckResult.Verdict.NOT_APPLICABLE).count();
        boolean compliant = failCount == 0 && doubtsCount == 0;

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("compliant", compliant);
        report.put("summary", Map.of(
                "total", results.size(),
                "pass", passCount,
                "fail", failCount,
                "doubts", doubtsCount,
                "not_applicable", naCount));
        report.put("results", results.stream().map(r -> Map.of(
                "ruleId", r.ruleId(),
                "verdict", r.verdict().name(),
                "explanation", r.explanation() != null ? r.explanation() : "",
                "confidence", r.confidence(),
                "checkType", r.checkType() != null ? r.checkType() : "")).toList());
        ctx.finalReport = report;

        ctx.eventBus.sessionCompleted(ctx.sessionId, compliant, (int) failCount);
        ctx.eventBus.stageCompleted(ctx.sessionId, "signoff", System.currentTimeMillis() - start);
        log.info("[{}] Signoff: compliant={} fail={} doubts={} pass={} na={}",
                ctx.sessionId, compliant, failCount, doubtsCount, passCount, naCount);
    }
}
