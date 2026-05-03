package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.EnrichedRule;
import com.lc.v2.checker.api.dto.SignoffRequest;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.infra.persistence.RuleCatalogJoiner;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineEventBus;
import com.lc.v2.checker.stage.signoff.Mt734Generator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign-off endpoints used by the SignoffPanel UI.
 *
 *   POST  /sessions/{id}/signoff    — officer signs off (immutable)
 *   GET   /sessions/{id}/signoff    — fetch existing sign-off record
 *   GET   /sessions/{id}/mt734      — auto-fill MT734 advice text (preview / export)
 *   GET   /sessions/{id}/audit      — audit trail (pipeline events + officer actions)
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}")
public class SignoffController {

    private static final Logger log = LoggerFactory.getLogger(SignoffController.class);

    private final SessionStore sessionStore;
    private final RuleCatalogJoiner joiner;
    private final Mt734Generator mt734Generator;
    private final PipelineEventBus eventBus;
    private final ObjectMapper objectMapper;

    public SignoffController(SessionStore sessionStore, RuleCatalogJoiner joiner,
                              Mt734Generator mt734Generator, PipelineEventBus eventBus,
                              ObjectMapper objectMapper) {
        this.sessionStore = sessionStore;
        this.joiner = joiner;
        this.mt734Generator = mt734Generator;
        this.eventBus = eventBus;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/signoff")
    public ResponseEntity<Map<String, Object>> getSignoff(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        Map<String, Object> existing = sessionStore.getSignoff(sessionId);
        if (existing == null) {
            return ResponseEntity.ok(Map.of("signed", false));
        }
        return ResponseEntity.ok(Map.of(
                "signed", true,
                "record", existing));
    }

    @PostMapping("/signoff")
    public ResponseEntity<Map<String, Object>> signoff(@PathVariable String sessionId,
                                                        @RequestBody SignoffRequest req) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        if (sessionStore.isSigned(sessionId)) return frozen();

        if (req.decision() == null || req.decision().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "decision is required"));
        }
        if (req.note() == null || req.note().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "officer note is required"));
        }

        try {
            String dispJson = objectMapper.writeValueAsString(
                    req.dispositions() == null ? Map.of() : req.dispositions());
            sessionStore.insertSignoff(sessionId, req.decision(), dispJson, req.note(), req.officerId());
        } catch (Exception e) {
            log.error("[{}] signoff persistence failed", sessionId, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }

        eventBus.signedOff(sessionId, req.decision(), req.officerId());
        log.info("[{}] signed off: decision={} officer={}", sessionId, req.decision(), req.officerId());

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "decision", req.decision(),
                "record", sessionStore.getSignoff(sessionId)));
    }

    @GetMapping(value = "/mt734", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> mt734(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();

        // Pull session + sign-off record + enriched rules to build the advice text
        Map<String, Object> session = sessionStore.getSession(sessionId);
        Map<String, Object> signoffRecord = sessionStore.getSignoff(sessionId);

        String decision = signoffRecord == null ? null : (String) signoffRecord.get("decision");
        Map<String, String> dispositions = parseDispositions(signoffRecord);

        String lcRef = lookupLcReference(sessionId);
        String amountText = lookupAmountText(sessionId);

        List<CheckResult> results = readCheckResultsFromFinalReport(sessionId);
        List<EnrichedRule> enriched = joiner.join(sessionId, results, null);
        List<EnrichedRule> failures = new ArrayList<>();
        for (EnrichedRule r : enriched) {
            if ("FAIL".equals(r.effectiveVerdict())) failures.add(r);
        }

        String advice = mt734Generator.generate(sessionId, lcRef, amountText, decision, failures, dispositions);
        return ResponseEntity.ok(advice);
    }

    @GetMapping("/audit")
    public ResponseEntity<Map<String, Object>> audit(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of(
                "sessionId", sessionId,
                "events", sessionStore.getEvents(sessionId)));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, String> parseDispositions(Map<String, Object> signoffRecord) {
        if (signoffRecord == null) return Map.of();
        Object raw = signoffRecord.get("discrepancy_dispositions");
        if (!(raw instanceof String s) || s.isBlank()) return Map.of();
        try {
            Object parsed = objectMapper.readValue(s, Object.class);
            if (parsed instanceof Map<?, ?> m) {
                Map<String, String> out = new LinkedHashMap<>();
                for (var e : m.entrySet()) {
                    if (e.getValue() != null) out.put(e.getKey().toString(), e.getValue().toString());
                }
                return out;
            }
            return Map.of();
        } catch (Exception e) { return Map.of(); }
    }

    private String lookupLcReference(String sessionId) {
        // sessionStore.listSessions includes lc_number for the session list view.
        return sessionStore.listSessions(200).stream()
                .filter(row -> sessionId.equalsIgnoreCase(String.valueOf(row.get("id"))))
                .map(row -> (String) row.get("lc_number"))
                .filter(s -> s != null && !s.isBlank())
                .findFirst()
                .orElse(null);
    }

    @SuppressWarnings("unchecked")
    private String lookupAmountText(String sessionId) {
        // Try to read amount from the LC consensus extraction via final_report
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return null;
        Object fr = session.get("final_report");
        if (!(fr instanceof String s) || s.isBlank()) return null;
        try {
            Map<String, Object> parsed = objectMapper.readValue(s, Map.class);
            Object lcAmount = parsed.get("lc_amount");
            if (lcAmount instanceof String) return (String) lcAmount;
        } catch (Exception e) { /* fall through */ }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<CheckResult> readCheckResultsFromFinalReport(String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return List.of();
        Object fr = session.get("final_report");
        if (!(fr instanceof String s) || s.isBlank()) return List.of();
        try {
            Map<String, Object> parsed = objectMapper.readValue(s, Map.class);
            Object rs = parsed.get("results");
            if (!(rs instanceof List<?> list)) return List.of();
            List<CheckResult> out = new ArrayList<>(list.size());
            for (Object obj : list) {
                if (!(obj instanceof Map<?, ?> m)) continue;
                Map<String, Object> map = (Map<String, Object>) m;
                String ruleId = (String) map.get("ruleId");
                String verdictStr = (String) map.get("verdict");
                if (ruleId == null || verdictStr == null) continue;
                CheckResult.Verdict verdict;
                try { verdict = CheckResult.Verdict.valueOf(verdictStr); }
                catch (IllegalArgumentException e) { continue; }
                String explanation = (String) map.getOrDefault("explanation", "");
                Object confObj = map.get("confidence");
                double confidence = confObj instanceof Number n ? n.doubleValue() : 0.0;
                String checkType = (String) map.get("checkType");
                Object evObj = map.get("evidence");
                Map<String, Object> evidence = evObj instanceof Map<?, ?> em ? (Map<String, Object>) em : null;
                out.add(new CheckResult(ruleId, verdict, explanation, evidence, confidence, checkType));
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    private static <T> ResponseEntity<T> frozen() {
        return ResponseEntity.status(409).build();
    }
}
