package com.lc.v2.checker.infra.observability;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a {@code Stage.execute} method as the boundary of a pipeline-stage
 * tracing span. {@link PipelineTracingAspect} opens / tags / ends the span
 * around the annotated method so stage implementations never reference a
 * {@code Tracer}.
 *
 * <p>The aspect derives:
 * <ul>
 *   <li>span name: {@link #value} when set, otherwise the {@code Stage.name()}
 *       returned by the target bean</li>
 *   <li>session tags: {@code session.id} / {@code langfuse.session.id} /
 *       {@code langfuse.trace.name} read from the {@code StageContext} argument</li>
 * </ul>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface PipelineStage {
    /** Optional override for the span name. Defaults to the bean's {@code Stage.name()}. */
    String value() default "";
}
