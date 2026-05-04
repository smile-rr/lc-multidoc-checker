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
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("decision", req.decision());
            payload.put("dispositions", req.dispositions() == null ? Map.of() : req.dispositions());
            payload.put("frozen", true);
            sessionStore.appendOfficerAction(sessionId, "signoff", "-",
                    objectMapper.writeValueAsString(payload),
                    req.officerId(), req.note());
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

        List<CheckResult> results = readCheckResults(sessionId);
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

    /** LC amount string for the MT734 advice — read from v_lc_parse fields. */
    @SuppressWarnings("unchecked")
    private String lookupAmountText(String sessionId) {
        Map<String, Object> lcView = sessionStore.getLcParse(sessionId);
        if (lcView == null) return null;
        String fieldsJson = (String) lcView.get("fields");
        if (fieldsJson == null || fieldsJson.isBlank()) return null;
        try {
            Map<String, Object> fields = objectMapper.readValue(fieldsJson, Map.class);
            Object currency = unwrapValue(fields.get("credit_currency"));
            Object amount = unwrapValue(fields.get("credit_amount"));
            if (amount == null) return null;
            return currency == null ? amount.toString() : currency + " " + amount;
        } catch (Exception e) { return null; }
    }

    /** Unwrap a FieldEnvelope object: {value, confidence, ...} → value. */
    private static Object unwrapValue(Object envelope) {
        if (envelope == null) return null;
        if (envelope instanceof Map<?, ?> m) {
            Object v = m.get("value");
            return v == null ? envelope : v;
        }
        return envelope;
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
                try { evidence = objectMapper.readValue(evJson, Map.class); } catch (Exception e) { /* leave null */ }
            }
            out.add(new CheckResult(ruleId, verdict, explanation, evidence, confidence, checkType));
        }
        return out;
    }

    private static <T> ResponseEntity<T> frozen() {
        return ResponseEntity.status(409).build();
    }
}
