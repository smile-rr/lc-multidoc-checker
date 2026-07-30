package com.tb.helix.core.event;

/**
 * Where progress goes.
 *
 * <p>One method, because a stage's relationship with progress reporting should be as thin
 * as possible: it says what happened and carries on. Whether that reaches a browser, a
 * log, or nothing at all is the adapter's problem.
 *
 * <p>Implementations must be non-blocking and must not throw. A stage that fails because
 * nobody was listening to its progress has been defeated by its own telemetry.
 */
public interface EventBus {

    /**
     * Publishes an event. Never throws.
     *
     * <p>Events are also persisted in sequence, so a browser that connects late or
     * reconnects mid-run can replay rather than showing an examination that appears to
     * have done nothing.
     */
    void publish(HelixEvent event);
}
