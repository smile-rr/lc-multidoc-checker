/**
 * The language both modules speak.
 *
 * <p>Governance authors a check with a severity and a tier; lc-check executes it and reports
 * against the same words. Before this package they were string literals in three places —
 * {@code "PROGRAMMATIC"} in the catalog adapter, {@code "EXACT"} in the gate, {@code
 * "CRITICAL"} in the planner — and nothing stopped a fourth spelling appearing.
 *
 * <p>This is <b>business</b> common, which is why it is neither {@code infra} nor
 * {@code harness}. Infra knows about bytes and rows; harness knows about documents and
 * models; neither has any business knowing what a discrepancy is. But a documentary credit
 * is exactly what both business modules are about, and they must agree on its terms.
 *
 * <p>A <b>shared kernel</b> in the DDD sense, and treated with the suspicion that deserves:
 * data only, no services, no state, no dependencies, and a change here is a change to two
 * modules at once. It stays small or it stops being a kernel and becomes a junk drawer.
 *
 * <p>It used to be called {@code domain} and held {@code CheckCatalog} as well. That was one
 * package pretending to be one thing: a vocabulary every module may read, and a service
 * contract only lc-check calls. Splitting them means the import tells you which you touched
 * — {@code governance.types} is vocabulary, {@code governance.spi} is a call into another
 * module.
 */
package com.tb.helix.governance.types;
