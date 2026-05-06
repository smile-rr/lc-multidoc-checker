package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.stream.PipelineEventChannel;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Endpoints for session event streaming and replay.
 *   GET /api/v2/sessions/{sessionId}/stream  — SSE pipeline event stream (live)
 *   GET /api/v2/sessions/{sessionId}/events   — all persisted events (for history popover)
 */
@RestController
@RequestMapping("/api/v2/sessions")
public class StreamController {

    private final PipelineEventChannel eventChannel;
    private final SessionStore sessionStore;

    public StreamController(PipelineEventChannel eventChannel, SessionStore sessionStore) {
        this.eventChannel = eventChannel;
        this.sessionStore = sessionStore;
    }

    @GetMapping(value = "/{sessionId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String sessionId, HttpServletResponse response) {
        // Disable nginx / Cloudflare / corporate-proxy buffering — without
        // these headers the SSE stream is held by the intermediary until the
        // backend closes the connection, so the UI never sees Parse progress
        // events through a public URL until the whole stage finishes.
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Connection", "keep-alive");
        return eventChannel.subscribe(sessionId);
    }

    /**
     * Returns all persisted pipeline events for the session, ordered by seq.
     * Frontend uses this to populate the event history popover (merged with any
     * live events received via SSE after the connection was established).
     */
    @GetMapping("/{sessionId}/events")
    public List<Map<String, Object>> events(@PathVariable String sessionId) {
        return sessionStore.getEvents(sessionId);
    }
}
