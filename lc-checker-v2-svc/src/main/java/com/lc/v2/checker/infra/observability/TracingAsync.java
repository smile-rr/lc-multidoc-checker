package com.lc.v2.checker.infra.observability;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * Tiny tracing-aware wrapper around {@link CompletableFuture#supplyAsync}.
 *
 * <p>The submitting thread's current tracing span is captured at submission
 * time and re-attached as the current scope on the worker thread, so child
 * spans started inside the supplier inherit the right parent. Replaces the
 * manual {@code parentSpan} parameter + {@code Tracer.SpanInScope} dance
 * that used to leak through method signatures.
 *
 * <p>Use anywhere a stage forks parallel work that needs to remain part of
 * the same Langfuse trace (vision-slot fan-out, parallel rule batches, …).
 */
@Component
public class TracingAsync {

    private final Tracer tracer;

    public TracingAsync(Tracer tracer) {
        this.tracer = tracer;
    }

    public <T> CompletableFuture<T> supplyAsync(Supplier<T> supplier) {
        Span captured = tracer.currentSpan();
        return CompletableFuture.supplyAsync(() -> {
            Tracer.SpanInScope scope = captured != null ? tracer.withSpan(captured) : null;
            try {
                return supplier.get();
            } finally {
                if (scope != null) scope.close();
            }
        });
    }
}
