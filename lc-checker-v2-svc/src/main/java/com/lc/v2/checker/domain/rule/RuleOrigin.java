package com.lc.v2.checker.domain.rule;

/**
 * Provenance of a rule.
 * <ul>
 *   <li>{@code CATALOG} — defined in the static UCP/ISBP catalog (catalog.yml).</li>
 *   <li>{@code DYNAMIC} — generated at runtime for one specific LC, persisted in
 *       {@code lc_v2.dynamic_rules}. Today produced by {@code LcRulePlannerAgent};
 *       future origins (officer-authored, prior-LC lookup) reuse this value.</li>
 * </ul>
 */
public enum RuleOrigin {
    CATALOG,
    DYNAMIC
}
