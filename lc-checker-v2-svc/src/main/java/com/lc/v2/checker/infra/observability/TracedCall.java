package com.lc.v2.checker.infra.observability;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a leaf method (typically an LLM / vision call) as the boundary of a
 * fine-grained tracing span. {@link TracedCallAspect} handles span lifecycle
 * + session tagging so the method body stays focused on business logic.
 *
 * <p>Use for methods like a single vision-slot call or a single rule
 * invocation. For top-of-stack stage methods use {@link PipelineStage}.
 *
 * <p>For per-argument dynamic tags (e.g. {@code doc_type=INV}), set them
 * inside the method via the standard {@code Tracer.currentSpan()} pattern,
 * or extend this aspect with SpEL evaluation when needed.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface TracedCall {
    /** Span name (literal). */
    String value();

    /**
     * Static tag key/value pairs applied at span open. Format: {@code "key=value"}.
     * Dynamic tags (depending on arguments) should be set inside the method
     * body via {@code Tracer.currentSpan().tag(...)}.
     */
    String[] tags() default {};
}
