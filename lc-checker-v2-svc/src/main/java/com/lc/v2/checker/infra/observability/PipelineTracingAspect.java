package com.lc.v2.checker.infra.observability;

import com.lc.v2.checker.pipeline.Stage;
import com.lc.v2.checker.pipeline.StageContext;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * Opens a tracing span around every method annotated with {@link PipelineStage}.
 *
 * <p>The session root span (managed by {@link SessionTraceRegistry}) is
 * already attached as the current scope by {@code PipelineService.runStageAsync},
 * so the span we open here automatically nests as a child of the session
 * root in Langfuse.
 */
@Aspect
@Component
public class PipelineTracingAspect {

    private final Tracer tracer;

    public PipelineTracingAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("@annotation(stageAnno)")
    public Object aroundStage(ProceedingJoinPoint pjp, PipelineStage stageAnno) throws Throwable {
        String spanName = !stageAnno.value().isEmpty()
                ? stageAnno.value()
                : (pjp.getTarget() instanceof Stage s ? s.name() : pjp.getSignature().getName());
        StageContext ctx = findStageContext(pjp.getArgs());

        Span span = tracer.nextSpan().name(spanName).start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            if (ctx != null && ctx.sessionId != null) {
                span.tag("session.id", ctx.sessionId);
                span.tag("langfuse.session.id", ctx.sessionId);
                span.tag("langfuse.trace.name", TraceNames.forSession(ctx.sessionId));
            }
            return pjp.proceed();
        } catch (Throwable t) {
            span.tag("error", String.valueOf(t.getMessage()));
            throw t;
        } finally {
            span.end();
        }
    }

    private static StageContext findStageContext(Object[] args) {
        if (args == null) return null;
        for (Object a : args) if (a instanceof StageContext c) return c;
        return null;
    }
}
