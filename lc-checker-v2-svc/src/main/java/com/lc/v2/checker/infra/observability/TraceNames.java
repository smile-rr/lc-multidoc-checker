package com.lc.v2.checker.infra.observability;

/**
 * Single source for the per-session Langfuse trace name. All exported spans
 * (root + children) tag {@code langfuse.trace.name} with this value so
 * Langfuse displays a stable, identifiable trace title regardless of which
 * span it derives the trace name from.
 *
 * Format: {@code lc-session-<last 8 chars of sessionId>}.
 * Hyphen-only (no embedded space) avoids inconsistent rendering across UIs.
 */
public final class TraceNames {

    private TraceNames() {}

    public static String forSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return "lc-session-unknown";
        String s = sessionId.trim();
        String tail = s.length() > 8 ? s.substring(s.length() - 8) : s;
        return "lc-session-" + tail;
    }
}
