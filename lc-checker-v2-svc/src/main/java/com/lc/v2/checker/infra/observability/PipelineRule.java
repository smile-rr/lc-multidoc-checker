package com.lc.v2.checker.infra.observability;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a rule execution method for automatic child-span creation under the enclosing stage span.
 * Annotate rule executor methods in ExamineStage.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface PipelineRule {
    String ruleId() default "";
    String checkType() default "";
}
