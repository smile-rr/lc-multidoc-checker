package com.lc.v2.checker.stage.examine;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.pipeline.StageContext;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

/**
 * Evaluates PROGRAMMATIC rule expressions using Spring SpEL.
 *
 * SpEL context variables:
 *   #lc          → Map&lt;String, Object&gt; of LC fields (FieldEnvelope.fields())
 *   #docs        → Map&lt;String, Map&lt;String, Object&gt;&gt; keyed by DocType.name()
 *   #presentationDate → today's ISO date string (UCP 14(h) reference)
 *
 * Convention: expression returns true = PASS, false = FAIL.
 */
@Component
public class SpelEvaluator {

    private static final Logger log = LoggerFactory.getLogger(SpelEvaluator.class);
    private static final SpelExpressionParser PARSER = new SpelExpressionParser();

    public CheckResult evaluate(Rule rule, StageContext ctx) {
        if (rule.expression() == null || rule.expression().isBlank()) {
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.DOUBTS,
                    "No SpEL expression configured", null, 0.5, "PROGRAMMATIC");
        }
        try {
            StandardEvaluationContext spelCtx = buildContext(ctx);
            Boolean result = PARSER.parseExpression(rule.expression()).getValue(spelCtx, Boolean.class);
            CheckResult.Verdict verdict = Boolean.TRUE.equals(result)
                    ? CheckResult.Verdict.PASS : CheckResult.Verdict.FAIL;
            return new CheckResult(rule.ruleId(), verdict, null, buildEvidence(rule, ctx), 1.0, "PROGRAMMATIC");
        } catch (Exception e) {
            log.warn("[{}] SpEL eval failed rule={}: {}", ctx.sessionId, rule.ruleId(), e.getMessage());
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.DOUBTS,
                    "SpEL evaluation error: " + e.getMessage(), null, 0.0, "PROGRAMMATIC");
        }
    }

    private StandardEvaluationContext buildContext(StageContext ctx) {
        StandardEvaluationContext spelCtx = new StandardEvaluationContext();

        spelCtx.setVariable("lc",
                new HashMap<>(ctx.lc != null ? ctx.lc.envelope().fields() : Map.of()));

        Map<String, Map<String, Object>> docsMap = new HashMap<>();
        if (ctx.extracts != null) {
            ctx.extracts.forEach((dt, extract) ->
                    docsMap.put(dt.name(), new HashMap<>(extract.consensus().fields())));
        }
        spelCtx.setVariable("docs", docsMap);
        spelCtx.setVariable("presentationDate", LocalDate.now().toString());

        return spelCtx;
    }

    private Map<String, Object> buildEvidence(Rule rule, StageContext ctx) {
        Map<String, Object> evidence = new HashMap<>();
        for (String key : rule.fieldKeys()) {
            if (ctx.lc != null && ctx.lc.envelope().has(key)) {
                evidence.put("lc_" + key, ctx.lc.envelope().get(key));
            }
            if (ctx.extracts != null) {
                ctx.extracts.forEach((dt, extract) -> {
                    Object val = extract.consensus().get(key);
                    if (val != null) evidence.put(dt.name().toLowerCase() + "_" + key, val);
                });
            }
        }
        return evidence.isEmpty() ? null : evidence;
    }
}
