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
 * Pipeline control: officer-triggered stage advance + re-run.
 *
 *   POST /sessions/{id}/stages/{stage}/run      body: {officerId}
 *     Advances the pipeline forward by one stage. The {stage} must match the
 *     session's recorded next_stage. Hard-gated flow — no auto-advance.
 *
 *   POST /sessions/{id}/stages/{stage}/rerun    body: {officerId}
 *     Re-runs from a prior stage. Wipes downstream rows + replays one stage,
 *     then waits again for officer trigger. Used when the officer goes back
 *     to a stage to correct data.
 *
 * Re-run requires the session's StageContext to still be in the in-process
 * cache. After JVM restart or sign-off, re-run returns 409.
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

    @PostMapping("/stages/{stage}/run")
    public ResponseEntity<Map<String, Object>> runStage(@PathVariable String sessionId,
                                                         @PathVariable String stage,
                                                         @RequestBody(required = false) Map<String, String> body) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        String officerId = body == null ? null : body.get("officerId");
        try {
            boolean started = pipelineService.runStage(sessionId, stage);
            if (!started) {
                return ResponseEntity.status(409).body(Map.of(
                        "error", "Session context expired. Re-running from this stage requires a fresh session."));
            }
            log.info("[{}] stage={} run triggered by {}", sessionId, stage, officerId);
            return ResponseEntity.ok(Map.of("ok", true, "stage", stage));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
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
