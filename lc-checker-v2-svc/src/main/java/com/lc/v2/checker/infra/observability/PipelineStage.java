package com.lc.v2.checker.infra.observability;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a Stage implementation for automatic Langfuse span wrapping.
 * PipelineTracingAspect intercepts execute() calls on annotated classes.
 * Business code has zero tracer references.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface PipelineStage {
    String name() default "";
}
