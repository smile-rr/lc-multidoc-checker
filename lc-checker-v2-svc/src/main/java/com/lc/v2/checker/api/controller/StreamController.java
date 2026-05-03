package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.infra.stream.PipelineEventChannel;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * GET /api/v2/sessions/{sessionId}/stream — SSE pipeline event stream.
 * Replays buffered events to new subscribers, then streams live events.
 */
@RestController
@RequestMapping("/api/v2/sessions")
public class StreamController {

    private final PipelineEventChannel eventChannel;

    public StreamController(PipelineEventChannel eventChannel) { this.eventChannel = eventChannel; }

    @GetMapping(value = "/{sessionId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String sessionId) {
        return eventChannel.subscribe(sessionId);
    }
}
