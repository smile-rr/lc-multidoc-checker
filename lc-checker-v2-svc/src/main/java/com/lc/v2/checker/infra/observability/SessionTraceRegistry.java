package com.lc.v2.checker.infra.observability;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Owns the per-session root tracing span lifecycle.
 *
 * <p>One trace per session: opened on session creation, closed on the terminal
 * stage (sign-off) or fatal failure. Every async stage run re-attaches the
 * session span as the current scope via {@link #runInSession} so that child
 * stage / LLM spans inherit it as parent and Langfuse renders the full
 * session as one trace tree.
 *
 * <p>All the awkward bridging quirks (clearing the current scope before
 * {@code setNoParent}, dual {@code langfuse.trace.name} + {@code session.id}
 * tags) live here — pipeline / stage code never sees a {@link Tracer}.
 */
@Component
public class SessionTraceRegistry {

    private static final Logger log = LoggerFactory.getLogger(SessionTraceRegistry.class);

    private final Tracer tracer;
    private final Map<String, Span> sessionSpans = new ConcurrentHashMap<>();

    public SessionTraceRegistry(Tracer tracer) {
        this.tracer = tracer;
    }

    /** Open the session root span. No-op if one already exists for the id. */
    public void open(String sessionId, Map<String, String> extraTags) {
        sessionSpans.computeIfAbsent(sessionId, sid -> buildSessionSpan(sid, extraTags, false));
    }

    /**
     * Open the session root span lazily (used after rehydration when the
     * original span was lost — typically a JVM restart followed by a stage
     * re-run from the in-memory cache miss path).
     */
    public void ensure(String sessionId) {
        sessionSpans.computeIfAbsent(sessionId, sid -> buildSessionSpan(sid, null, true));
    }

    /** End the session span; tag {@code error} when supplied. Idempotent. */
    public void end(String sessionId, String error) {
        Span span = sessionSpans.remove(sessionId);
        if (span == null) return;
        if (error != null) span.tag("error", error);
        span.end();
    }

    /**
     * Run the supplied work with the session span attached as the current
     * tracing scope. All spans started inside (stage spans, LLM spans) inherit
     * the session span as parent.
     */
    public void runInSession(String sessionId, Runnable work) {
        Span session = sessionSpans.get(sessionId);
        Tracer.SpanInScope scope = session != null ? tracer.withSpan(session) : null;
        try {
            work.run();
        } finally {
            if (scope != null) scope.close();
        }
    }

    private Span buildSessionSpan(String sessionId, Map<String, String> extraTags, boolean rehydrated) {
        String traceName = TraceNames.forSession(sessionId);
        // Clear any current scope so the OTel bridge cannot pick the controller's
        // HTTP server span up as parent — a known quirk where setNoParent is
        // observed to be ignored when a current scope is active.
        Tracer.SpanInScope cleared = tracer.withSpan(null);
        try {
            var b = tracer.spanBuilder()
                    .setNoParent()
                    .name(traceName)
                    .tag("session.id", sessionId)
                    .tag("langfuse.session.id", sessionId)
                    .tag("langfuse.trace.name", traceName);
            if (rehydrated) b.tag("rehydrated", "true");
            if (extraTags != null) extraTags.forEach(b::tag);
            return b.start();
        } finally {
            if (cleared != null) cleared.close();
        }
    }
}
