package com.tb.helix.infra.cost;

/**
 * Which examination, stage and step a model call belongs to.
 *
 * <p>The gateway knows everything technical about a call — model, slot, tokens, latency,
 * whether it failed — and nothing about why it was made. The stage knows why and nothing
 * about the call. Threading a context object through {@code TextRequest},
 * {@code VisionRequest} and {@code ToolRequest} would put an examination's vocabulary into
 * three records that are deliberately domain-neutral, so instead the caller binds it for
 * the duration of the work.
 *
 * <p>Not inheritable, and captured explicitly instead. An {@code InheritableThreadLocal}
 * would appear to work and then quietly stop at the first pooled thread — and the vision
 * path fans out across a pool, which is exactly where the attribution matters most, because
 * that is where the money goes. {@link #capture()} before dispatching, {@link #bind} inside
 * the task; anything that forgets records a call with no case rather than a call attributed
 * to whatever ran on that thread last.
 */
public final class CallScope {

    /** Nothing bound: a call made outside any examination. Recorded, not dropped. */
    public static final CallScope NONE = new CallScope(null, null, null);

    private static final ThreadLocal<CallScope> CURRENT = ThreadLocal.withInitial(() -> NONE);

    private final String caseId;
    private final String stage;
    private final String step;

    private CallScope(String caseId, String stage, String step) {
        this.caseId = caseId;
        this.stage = stage;
        this.step = step;
    }

    public static CallScope of(String caseId, String stage, String step) {
        return new CallScope(caseId, stage, step);
    }

    /** What is bound on this thread. Never null. */
    public static CallScope current() {
        return CURRENT.get();
    }

    /** What is bound now, to be re-bound on another thread. */
    public static CallScope capture() {
        return CURRENT.get();
    }

    /**
     * Runs {@code body} with this scope bound, restoring whatever was there before.
     *
     * <p>Restoring rather than clearing, because stages nest: the step scope inside a stage
     * scope must give the stage back when it ends, not leave the thread bare.
     */
    public static <T> T bind(CallScope scope, java.util.function.Supplier<T> body) {
        CallScope previous = CURRENT.get();
        CURRENT.set(scope == null ? NONE : scope);
        try {
            return body.get();
        } finally {
            CURRENT.set(previous);
        }
    }

    public static void bind(CallScope scope, Runnable body) {
        bind(scope, () -> {
            body.run();
            return null;
        });
    }

    /** The same scope, narrowed to a step. */
    public CallScope atStep(String newStep) {
        return new CallScope(caseId, stage, newStep);
    }

    public String caseId() {
        return caseId;
    }

    public String stage() {
        return stage;
    }

    public String step() {
        return step;
    }
}
