package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.EnrichedRule;
import com.lc.v2.checker.api.dto.OverrideRequest;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.infra.persistence.RuleCatalogJoiner;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

        List<CheckResult> results = readCheckResults(sessionId);
        // Note: extractsByDocType is null here — attention chips that depend on
        // extraction signals (SPLIT/HANDWRITING) only fire if the data is in-context.
        List<EnrichedRule> enriched = joiner.join(sessionId, results, null);
        return ResponseEntity.ok(Map.of("rules", enriched));
    }

    @PostMapping("/{ruleId}/override")
    public ResponseEntity<Map<String, Object>> override(@PathVariable String sessionId,
                                                         @PathVariable String ruleId,
                                                         @RequestBody OverrideRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("new_status", req.newStatus());
            payload.put("reason", req.reason());
            payload.put("flagged", req.flagged());
            sessionStore.appendOfficerAction(sessionId, "rule_override", ruleId,
                    objectMapper.writeValueAsString(payload),
                    req.officerId(), req.note());
        } catch (Exception e) {
            log.warn("[{}] officer_actions append failed for rule_override: {}", sessionId, e.getMessage());
        }
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

        String officerId = req == null ? null : req.officerId();
        sessionStore.appendOfficerAction(sessionId, "rule_override_cleared", ruleId,
                "{}", officerId, null);
        eventBus.overrideCleared(sessionId, ruleId, officerId);
        log.info("[{}] override cleared rule={}", sessionId, ruleId);
        return ResponseEntity.ok(Map.of("ok", true, "ruleId", ruleId));
    }

    /** Read every per-rule outcome from {@code v_check_results}. */
    @SuppressWarnings("unchecked")
    private List<CheckResult> readCheckResults(String sessionId) {
        List<Map<String, Object>> rows = sessionStore.getCheckResults(sessionId);
        List<CheckResult> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            String ruleId = (String) r.get("rule_id");
            String verdictStr = (String) r.get("system_verdict");
            if (ruleId == null || verdictStr == null) continue;
            CheckResult.Verdict verdict;
            try { verdict = CheckResult.Verdict.valueOf(verdictStr); }
            catch (IllegalArgumentException e) { continue; }
            String explanation = (String) r.getOrDefault("explanation", "");
            double confidence = r.get("confidence") instanceof Number n ? n.doubleValue() : 0.0;
            String checkType = (String) r.get("check_type");
            Map<String, Object> evidence = null;
            String evJson = (String) r.get("evidence");
            if (evJson != null && !evJson.isBlank()) {
                try {
                    evidence = objectMapper.readValue(evJson, Map.class);
                } catch (Exception e) { /* leave null */ }
            }
            out.add(new CheckResult(ruleId, verdict, explanation, evidence, confidence, checkType));
        }
        return out;
    }

    private static <T> ResponseEntity<T> frozen() {
        return ResponseEntity.status(409).build();
    }
}
