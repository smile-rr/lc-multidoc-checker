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
     * What causes this phase to run.
     *
     * <p>The phase's own answer, so that a pipeline can be asked "which run automatically"
     * and "which may a person request" without a second list of keys to maintain beside it.
     */
    default Trigger trigger() {
        return Trigger.ON_REQUEST;
    }

    /**
     * The steps, in order.
     *
     * <p>Read per run rather than cached, so a phase may compose its list from configuration.
     * It should not branch on the context — whether a step applies is
     * {@link Step#appliesTo}'s job, so a skip is recorded rather than invisible.
     */
    List<Step<C>> steps();
}
