package com.lc.v2.checker.api.controller;

import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Pipeline control: cancel a running session or re-run from a chosen stage.
 *
 *   POST /sessions/{id}/cancel                  body: {officerId}
 *   POST /sessions/{id}/stages/{stage}/rerun    body: {officerId}
 *
 * Cancel is cooperative: the in-flight stage runs to completion, then the
 * pipeline loop exits. Re-run wipes downstream DB rows + ctx fields then
 * replays from the chosen stage.
 *
 * Re-run requires the session's StageContext to still be in the in-process
 * cache (the upload bytes live there). After JVM restart or sign-off, re-run
 * returns 409 — caller should start a fresh session.
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}")
public class PipelineControlController {

    private static final Logger log = LoggerFactory.getLogger(PipelineControlController.class);

    private final PipelineService pipelineService;
    private final SessionStore sessionStore;

    public PipelineControlController(PipelineService pipelineService, SessionStore sessionStore) {
        this.pipelineService = pipelineService;
        this.sessionStore = sessionStore;
    }

    @PostMapping("/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable String sessionId,
                                                       @RequestBody(required = false) Map<String, String> body) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) {
            return ResponseEntity.status(409).body(Map.of("error", "Session is signed (frozen)"));
        }
        String officerId = body == null ? null : body.get("officerId");
        boolean ok = pipelineService.cancel(sessionId, officerId);
        if (!ok) {
            return ResponseEntity.status(409).body(Map.of(
                    "error", "Session has no active in-memory context (already complete or evicted)"));
        }
        log.info("[{}] cancel requested by {}", sessionId, officerId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/stages/{stage}/rerun")
    public ResponseEntity<Map<String, Object>> rerun(@PathVariable String sessionId,
                                                      @PathVariable String stage,
                                                      @RequestBody(required = false) Map<String, String> body) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        String officerId = body == null ? null : body.get("officerId");
        try {
            boolean started = pipelineService.rerunFromStage(sessionId, stage, officerId);
            if (!started) {
                return ResponseEntity.status(409).body(Map.of(
                        "error", "Re-run unavailable (session context expired). Start a new session."));
            }
            return ResponseEntity.ok(Map.of("ok", true, "fromStage", stage));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
