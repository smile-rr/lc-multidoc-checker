package com.lc.v2.checker.infra.observability;

import com.lc.v2.checker.pipeline.StageContext;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * Opens a child tracing span around every method annotated with
 * {@link TracedCall}. The current scope (session root or stage span) is
 * inherited as parent, so the resulting tree in Langfuse is
 * {@code session → stage → call}.
 */
@Aspect
@Component
public class TracedCallAspect {

    private final Tracer tracer;

    public TracedCallAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("@annotation(callAnno)")
    public Object aroundCall(ProceedingJoinPoint pjp, TracedCall callAnno) throws Throwable {
        Span span = tracer.nextSpan().name(callAnno.value()).start();
        try (Tracer.SpanInScope ws = tracer.withSpan(span)) {
            applyStaticTags(span, callAnno.tags());
            applySessionTagsIfPresent(span, pjp.getArgs());
            return pjp.proceed();
        } catch (Throwable t) {
            span.tag("error", String.valueOf(t.getMessage()));
            throw t;
        } finally {
            span.end();
        }
    }

    private static void applyStaticTags(Span span, String[] tags) {
        if (tags == null) return;
        for (String pair : tags) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            span.tag(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
        }
    }

    private static void applySessionTagsIfPresent(Span span, Object[] args) {
        if (args == null) return;
        for (Object a : args) {
            if (a instanceof StageContext ctx && ctx.sessionId != null) {
                span.tag("session.id", ctx.sessionId);
                span.tag("langfuse.session.id", ctx.sessionId);
                span.tag("langfuse.trace.name", TraceNames.forSession(ctx.sessionId));
                return;
            }
        }
    }
}
