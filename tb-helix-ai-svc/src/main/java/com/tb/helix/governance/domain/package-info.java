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
 * <p>It holds vocabulary and nothing else — enums, codes, and the derivations that follow
 * from them. No services, no state, no dependencies. Named for what it is so that it
 * resists becoming the place things go when nobody knows where they belong: you cannot
 * argue a repository into something called vocabulary.
 */
package com.tb.helix.governance.domain;
