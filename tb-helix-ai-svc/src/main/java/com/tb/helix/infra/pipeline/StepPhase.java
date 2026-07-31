package com.tb.helix.infra.pipeline;

import java.util.List;

/**
 * A named group of steps, run in order.
 *
 * <p>Deliberately not called a stage: "stage" is a word the caller may want for its own
 * concept, and this is only "some steps with a name on them".
 *
 * @param <C> the context the steps run against
 */
public interface StepPhase<C> {

    /** Stable identity for the group. */
    String key();

    /**
     * The steps, in order.
     *
     * <p>Read per run rather than cached, so a phase may compose its list from configuration.
     * It should not branch on the context — whether a step applies is
     * {@link Step#appliesTo}'s job, so a skip is recorded rather than invisible.
     */
    List<Step<C>> steps();
}
