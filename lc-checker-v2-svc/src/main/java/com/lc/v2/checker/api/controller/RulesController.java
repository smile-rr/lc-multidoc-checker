package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.EnrichedRule;
import com.lc.v2.checker.api.dto.OverrideRequest;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.infra.persistence.RuleCatalogJoiner;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rules-stage endpoints: serve enriched rules (catalog × verdict × override) and
 * accept officer overrides on individual rule outcomes.
 *
 *   GET    /sessions/{id}/rules                              — full enriched list
 *   POST   /sessions/{id}/rules/{ruleId}/override            — override a rule verdict
 *   DELETE /sessions/{id}/rules/{ruleId}/override            — reset to system verdict
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}/rules")
public class RulesController {

    private static final Logger log = LoggerFactory.getLogger(RulesController.class);

    private final SessionStore sessionStore;
    private final RuleCatalogJoiner joiner;
    private final PipelineEventBus eventBus;
    private final ObjectMapper objectMapper;

    public RulesController(SessionStore sessionStore, RuleCatalogJoiner joiner,
                            PipelineEventBus eventBus, ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.joiner = joiner;
        this.eventBus = eventBus;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getRules(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();

        List<CheckResult> results = readCheckResultsFromFinalReport(sessionId);
        // Note: extractsByDocType is null here — attention chips that depend on
        // extraction signals (SPLIT/HANDWRITING) only fire if the data is in-context.
        // Future: persist the consensus extracts and rehydrate here.
        List<EnrichedRule> enriched = joiner.join(sessionId, results, null);
        return ResponseEntity.ok(Map.of("rules", enriched));
    }

    @PostMapping("/{ruleId}/override")
    public ResponseEntity<Map<String, Object>> override(@PathVariable String sessionId,
                                                         @PathVariable String ruleId,
                                                         @RequestBody OverrideRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        sessionStore.insertOverride(sessionId, ruleId, req.newStatus(), req.reason(), req.note(), req.flagged());
        eventBus.ruleOverridden(sessionId, ruleId, req.newStatus(), req.reason(), req.flagged(), req.officerId());
        log.info("[{}] override rule={} new={} reason={} flagged={}",
                sessionId, ruleId, req.newStatus(), req.reason(), req.flagged());

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "ruleId", ruleId,
                "newStatus", req.newStatus(),
                "flagged", req.flagged()));
    }

    @DeleteMapping("/{ruleId}/override")
    public ResponseEntity<Map<String, Object>> resetOverride(@PathVariable String sessionId,
                                                              @PathVariable String ruleId,
                                                              @RequestBody(required = false) OverrideRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        sessionStore.deleteOverridesForRule(sessionId, ruleId);
        String officerId = req == null ? null : req.officerId();
        eventBus.overrideCleared(sessionId, ruleId, officerId);
        log.info("[{}] override cleared rule={}", sessionId, ruleId);
        return ResponseEntity.ok(Map.of("ok", true, "ruleId", ruleId));
    }

    /** Pull the {results: [...]} array out of session.final_report (JSON string). */
    @SuppressWarnings("unchecked")
    private List<CheckResult> readCheckResultsFromFinalReport(String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return List.of();
        Object finalReport = session.get("final_report");
        if (!(finalReport instanceof String fr) || fr.isBlank()) return List.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(fr, Map.class);
            Object rs = parsed.get("results");
            if (!(rs instanceof List<?> list)) return List.of();
            List<CheckResult> out = new ArrayList<>(list.size());
            for (Object obj : list) {
                if (!(obj instanceof Map<?, ?> map)) continue;
                Map<String, Object> m = (Map<String, Object>) map;
                String ruleId = (String) m.get("ruleId");
                String verdictStr = (String) m.get("verdict");
                if (ruleId == null || verdictStr == null) continue;
                CheckResult.Verdict verdict;
                try { verdict = CheckResult.Verdict.valueOf(verdictStr); }
                catch (IllegalArgumentException e) { continue; }
                String explanation = (String) m.getOrDefault("explanation", "");
                Object confObj = m.get("confidence");
                double confidence = confObj instanceof Number n ? n.doubleValue() : 0.0;
                String checkType = (String) m.get("checkType");
                Object evObj = m.get("evidence");
                Map<String, Object> evidence = evObj instanceof Map<?, ?> em ? (Map<String, Object>) em : null;
                out.add(new CheckResult(ruleId, verdict, explanation, evidence, confidence, checkType));
            }
            return out;
        } catch (Exception e) {
            log.warn("[{}] could not parse final_report: {}", sessionId, e.getMessage());
            return List.of();
        }
    }

    private static <T> ResponseEntity<T> frozen() {
        return ResponseEntity.status(409).build();
    }
}
