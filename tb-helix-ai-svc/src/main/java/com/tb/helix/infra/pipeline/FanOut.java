package com.tb.helix.infra.pipeline;

import com.tb.helix.infra.cost.CallScope;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.function.Function;

/**
 * One step, many independent units of work, a bounded number of them at once.
 *
 * <p>A stage that reads twenty documents or runs forty checks is not twenty or forty steps —
 * the fan-out's width is not known until the run is under way, and {@code steps()} must not
 * depend on the case. So it stays one declared step whose body walks a list, and this is what
 * that walk becomes when the list is worth walking in parallel.
 *
 * <p><b>Three things it does that a stream with a parallel() on it does not.</b>
 *
 * <ul>
 *   <li><b>Carries the {@link CallScope}.</b> The scope is a ThreadLocal and deliberately not
 *       inheritable, so a task on a pool thread would otherwise record its model calls against
 *       no case at all — and this is the path the money is on. Captured on the calling thread,
 *       bound inside each task. A body that wants finer attribution narrows it further with
 *       {@link CallScope#atStep}.
 *   <li><b>Bounds the width.</b> Virtual threads are free; the provider's rate limit, the
 *       heap a PDF render needs and the connection pool are not. The ceiling is the caller's
 *       to choose and is the whole safety of this class.
 *   <li><b>Isolates failure.</b> One unit that throws contributes {@code null} and the rest
 *       still complete. A join that propagated the first exception would lose nineteen
 *       documents to one bad scan, which is exactly what the serial loop this replaces was
 *       careful not to do.
 * </ul>
 *
 * <p><b>Cancellation is the body's job.</b> Every task is submitted at once and gates on a
 * permit, so a task that has not started yet is a task holding no resources — the useful check
 * is at the top of the body, after the permit is acquired. The effect of a cancel is therefore
 * "at most {@code width} more units finish", not "everything stops now": a call already in
 * flight with a provider cannot be taken back, only waited out or abandoned.
 *
 * <p>Static and not a bean, like {@link PipelineEngine} beside it: it holds no state, has no
 * collaborators and is a function over its arguments. Registering it would also make domain
 * code depend on a concrete {@code @Component} in {@code infra}, which the boundary rules
 * forbid.
 */
public final class FanOut {

    private static final Logger log = LoggerFactory.getLogger(FanOut.class);

    private FanOut() {
    }

    /**
     * Runs {@code work} over every item, at most {@code width} at a time.
     *
     * @param width how many may be in flight. One — or a single item — runs serially with no
     *              pool and no permit at all, so turning the width down gives back exactly the
     *              loop this replaced rather than a concurrent one that happens to be narrow.
     * @return one result per item, in the order the items were given, with {@code null} where
     *         a unit threw. Order is preserved because a caller reporting on the fan-out
     *         should not have to care which unit finished first.
     */
    public static <T, R> List<R> over(List<T> items, int width, Function<T, R> work) {
        if (items == null || items.isEmpty()) return List.of();

        if (width <= 1 || items.size() == 1) {
            List<R> out = new ArrayList<>(items.size());
            for (T item : items) out.add(guarded(work, item));
            return out;
        }

        Semaphore permits = new Semaphore(width);
        CallScope scope = CallScope.capture();

        // Closing the executor waits for termination; every future is joined above it, so by
        // the time close() runs there is nothing left to wait for.
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<CompletableFuture<R>> futures = items.stream()
                    .map(item -> CompletableFuture.supplyAsync(() -> {
                        permits.acquireUninterruptibly();
                        try {
                            return CallScope.bind(scope, () -> guarded(work, item));
                        } finally {
                            permits.release();
                        }
                    }, pool))
                    .toList();
            return futures.stream().map(CompletableFuture::join).toList();
        }
    }

    /**
     * The net beneath the body's own error handling, not a substitute for it.
     *
     * <p>A body that knows what a failure means to it should catch and record — the stages
     * here do, because "this document could not be read" is a thing an officer has to see, and
     * a null in a result list is not that. What is left for this to catch is the failure
     * nobody anticipated, and the only thing it can usefully do is keep it from taking the
     * other units with it.
     */
    private static <T, R> R guarded(Function<T, R> work, T item) {
        try {
            return work.apply(item);
        } catch (RuntimeException e) {
            log.warn("A fanned-out unit of work failed and was dropped: {}", e.toString(), e);
            return null;
        }
    }
}
