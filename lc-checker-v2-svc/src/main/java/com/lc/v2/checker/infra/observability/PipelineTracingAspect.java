package com.lc.v2.checker.infra.observability;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * AOP interceptor for @PipelineStage and @PipelineRule annotations.
 * Wraps each stage.execute() call in a Langfuse span; wraps each rule execution
 * in a child span. Business code contains zero tracer references.
 *
 * Stage span name: "stage.<name>" (e.g. "stage.intake", "stage.examine")
 * Rule span name:  "rule.<ruleId>" (e.g. "rule.INV-006")
 */
@Aspect
@Component
public class PipelineTracingAspect {

    private static final Logger log = LoggerFactory.getLogger(PipelineTracingAspect.class);
    private final Tracer tracer;

    public PipelineTracingAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("execution(* com.lc.v2.checker.stage..*.execute(..)) && @within(stageAnnotation)")
    public Object aroundStageExecute(ProceedingJoinPoint pjp, PipelineStage stageAnnotation) throws Throwable {
        String stageName = stageAnnotation.name().isBlank()
                ? pjp.getTarget().getClass().getSimpleName()
                : stageAnnotation.name();

        Span span = tracer.nextSpan().name("stage." + stageName).start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            span.tag("stage", stageName);
            return pjp.proceed();
        } catch (Throwable t) {
            span.tag("error", t.getMessage());
            throw t;
        } finally {
            span.end();
        }
    }

    @Around("execution(* com.lc.v2.checker.stage..*.*(..)) && @annotation(ruleAnnotation)")
    public Object aroundRuleExecution(ProceedingJoinPoint pjp, PipelineRule ruleAnnotation) throws Throwable {
        String ruleId = ruleAnnotation.ruleId().isBlank()
                ? pjp.getSignature().getName()
                : ruleAnnotation.ruleId();
        String checkType = ruleAnnotation.checkType();

        Span span = tracer.nextSpan().name("rule." + ruleId).start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            span.tag("rule_id", ruleId);
            if (!checkType.isBlank()) span.tag("check_type", checkType);
            return pjp.proceed();
        } catch (Throwable t) {
            span.tag("error", t.getMessage());
            throw t;
        } finally {
            span.end();
        }
    }
}
