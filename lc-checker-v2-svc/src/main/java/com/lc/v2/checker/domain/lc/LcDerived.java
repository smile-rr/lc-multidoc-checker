package com.lc.v2.checker.domain.lc;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Derived LC values computed once at parse, exposed to triggers and SpEL via
 * {@code ctx.lc.derived()}. Centralises Pitfall-3 (tolerance precedence), Pitfall-4
 * (Incoterms cascade), and Pitfall-7 (prohibition flags) so per-rule evaluation
 * doesn't re-implement the precedence stack.
 */
public record LcDerived(
        String incotermsClass,           // EXW|FOB|CFR|CIF|CIP|DAP|DDP|FCA|CPT|UNKNOWN
        ToleranceSpec effectiveTolerance,
        String tenorClass,               // SIGHT|USANCE_DAYS|DEFERRED|MIXED|UNKNOWN
        boolean transhipmentProhibited,
        boolean partialShipmentProhibited
) {

    /**
     * Tolerance with provenance.
     *
     * @param pct    percent tolerance (0 for EXACT)
     * @param mode   EXPLICIT (from :39A:), ABOUT (from :32B:/:39A: text), BULK_DEFAULT, EXACT
     * @param source "39A" | "32B" | "default"
     */
    public record ToleranceSpec(BigDecimal pct, String mode, String source) {}

    /** Snake-cased view used by {@code derived_equals} triggers and SpEL. */
    public Map<String, Object> asMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("incoterms_class", incotermsClass);
        m.put("tenor_class", tenorClass);
        m.put("transhipment_prohibited", transhipmentProhibited);
        m.put("partial_shipment_prohibited", partialShipmentProhibited);
        if (effectiveTolerance != null) {
            m.put("tolerance_pct", effectiveTolerance.pct());
            m.put("tolerance_mode", effectiveTolerance.mode());
            m.put("tolerance_source", effectiveTolerance.source());
        }
        return m;
    }
}
