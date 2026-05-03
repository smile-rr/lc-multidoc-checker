package com.lc.v2.checker.domain.rule;

import java.util.Map;
import java.util.Set;

/**
 * Read-only context for trigger evaluation. Built once per session at the top of ExamineStage.
 *
 * @param lcFields            ctx.lc.envelope().fields() — flat key-value LC envelope
 * @param lcDerived           snake_cased LcDerived snapshot (incoterms_class, tenor_class, …)
 * @param presentedDocTypes   names of DocTypes for which extracts exist (e.g. INV, BOL)
 * @param consistencyClauses  per-clause status: "OK" or "CONTRADICTORY:&lt;reason&gt;"
 */
public record ExamineContext(
        Map<String, Object> lcFields,
        Map<String, Object> lcDerived,
        Set<String> presentedDocTypes,
        Map<String, String> consistencyClauses
) {
    public ExamineContext {
        lcFields = lcFields == null ? Map.of() : Map.copyOf(lcFields);
        lcDerived = lcDerived == null ? Map.of() : Map.copyOf(lcDerived);
        presentedDocTypes = presentedDocTypes == null ? Set.of() : Set.copyOf(presentedDocTypes);
        consistencyClauses = consistencyClauses == null ? Map.of() : Map.copyOf(consistencyClauses);
    }
}
