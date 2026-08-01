package com.tb.helix.harness.llm.backend;

/**
 * One configured model that can answer, named the way the configuration names it.
 *
 * <p>A value object, deliberately: it is logged, reported on the run log and written to the
 * spend ledger, so it holds what those readers need and no live connection. A backend keeps
 * whatever it actually calls — a client, a framework object, a session — keyed by {@link #id}
 * on its own side.
 *
 * @param id          the configured name, e.g. {@code vlm-1}. This is what
 *                    {@code helix.models.roles} points at, what the run log shows as the slot,
 *                    and what the ledger records. Unique across every backend
 * @param model       the model that will actually answer, for the record and for pricing
 * @param endpoint    where it is, when that means anything. Null for an in-process backend —
 *                    the run log simply omits the row rather than showing an empty one
 * @param temperature reported so a reader can tell a sampling answer from a repeatable one.
 *                    Zero for anything cacheable, always
 */
public record ModelHandle(
        String id,
        String model,
        String endpoint,
        Double temperature,
        Integer maxTokens) {
}
