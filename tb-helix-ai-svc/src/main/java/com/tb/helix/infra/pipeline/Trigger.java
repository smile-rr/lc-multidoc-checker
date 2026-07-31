package com.tb.helix.infra.pipeline;

/**
 * What causes a phase to run.
 *
 * <p>Declared on the phase itself rather than held as lists of keys somewhere else. Two such
 * lists existed — "the ones that start automatically" and "the ones a person may ask for" —
 * and a list of keys is a second place to describe a phase that has to be kept in step with
 * the phase by hand.
 */
public enum Trigger {

    /** Runs by itself, as soon as there is something to run it on. */
    AUTOMATIC,

    /** Waits to be asked for by name. */
    ON_REQUEST,

    /**
     * Runs immediately before the next {@link #ON_REQUEST} phase, as part of asking for it.
     *
     * <p>For work that must happen first but is not a thing anyone would request on its own —
     * a cheap precondition guarding an expensive phase. It has no button, so nothing can park
     * waiting for one.
     */
    WITH_NEXT
}
