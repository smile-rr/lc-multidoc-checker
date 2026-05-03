package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.infra.lc.Lc46aRequiredDocsParser;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.pipeline.PipelineService;
import com.lc.v2.checker.pipeline.StageContext;
import com.lc.v2.checker.domain.lc.LcParseResult;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * LC-derived endpoints used by Intake's right-rail required-doc checklist.
 *
 *   GET  /sessions/{id}/lc/required-docs
 *        → { parsed46A, required: [{ type, copies, label, present }] }
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}/lc")
public class LcController {

    private static final Logger log = LoggerFactory.getLogger(LcController.class);

    private final SessionStore sessionStore;
    private final Lc46aRequiredDocsParser parser;
    private final ObjectMapper objectMapper;
    private final PipelineService pipelineService;

    public LcController(SessionStore sessionStore, Lc46aRequiredDocsParser parser,
                         ObjectMapper objectMapper, PipelineService pipelineService) {
        this.sessionStore = sessionStore;
        this.parser = parser;
        this.objectMapper = objectMapper;
        this.pipelineService = pipelineService;
    }

    /**
     * Returns the LC source view used by the Parse stage's MT700 pane:
     *   { text, fields, warnings, rawFields }
     *
     * Source priority:
     *   1. live StageContext (post-parse-stage) — has full LcParseResult
     *   2. final_report.lc.raw (after sign-off) — text only
     *   3. ctx.lcText (before parse) — raw upload, no fields yet
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getLc(@PathVariable String sessionId) {
        if (!sessionStore.sessionExists(sessionId)) return ResponseEntity.notFound().build();

        Map<String, Object> response = new LinkedHashMap<>();
        StageContext ctx = pipelineService.getContext(sessionId);

        if (ctx != null && ctx.lc != null) {
            LcParseResult lc = ctx.lc;
            response.put("text", lc.rawMt700() != null ? lc.rawMt700() : (ctx.lcText != null ? ctx.lcText : ""));
            response.put("fields", lc.envelope().fields());
            response.put("rawFields", lc.rawFields());
            response.put("warnings", lc.consistencyWarnings());
            return ResponseEntity.ok(response);
        }

        // Fallback to ctx.lcText if pipeline hasn't reached Parse yet.
        if (ctx != null && ctx.lcText != null) {
            response.put("text", ctx.lcText);
            response.put("fields", Map.of());
            response.put("rawFields", Map.of());
            response.put("warnings", List.of());
            return ResponseEntity.ok(response);
        }

        // Final fallback — pull raw text from final_report.lc.raw.
        Map<String, Object> session = sessionStore.getSession(sessionId);
        String text = readLcRawText(session);
        response.put("text", text);
        response.put("fields", Map.of());
        response.put("rawFields", Map.of());
        response.put("warnings", List.of());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/required-docs")
    public ResponseEntity<Map<String, Object>> requiredDocs(@PathVariable String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return ResponseEntity.notFound().build();

        // Reconstruct LC text from final_report.lc.raw if available; else best-effort empty.
        String lcText = readLcRawText(session);
        Lc46aRequiredDocsParser.Result parsed = parser.parse(lcText);

        // Mark which required docs are present in the session
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> docs = (List<Map<String, Object>>) session.get("documents");
        java.util.Set<String> presentTypes = new java.util.HashSet<>();
        if (docs != null) for (Map<String, Object> d : docs) {
            Object dt = d.get("doc_type");
            if (dt != null) presentTypes.add(dt.toString());
        }

        List<Map<String, Object>> required = new java.util.ArrayList<>(parsed.required().size());
        for (var r : parsed.required()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("type", r.type());
            entry.put("copies", r.copies());
            entry.put("label", r.label());
            entry.put("present", presentTypes.contains(r.type()));
            required.add(entry);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("parsed46A", parsed.parsed46A());
        response.put("required", required);
        return ResponseEntity.ok(response);
    }

    @SuppressWarnings("unchecked")
    private String readLcRawText(Map<String, Object> session) {
        Object fr = session.get("final_report");
        if (!(fr instanceof String s) || s.isBlank()) return "";
        try {
            Map<String, Object> parsed = objectMapper.readValue(s, Map.class);
            Object lc = parsed.get("lc");
            if (lc instanceof Map<?, ?> m) {
                Object raw = m.get("raw");
                if (raw instanceof String r) return r;
            }
        } catch (Exception e) { /* swallow */ }
        return "";
    }
}
