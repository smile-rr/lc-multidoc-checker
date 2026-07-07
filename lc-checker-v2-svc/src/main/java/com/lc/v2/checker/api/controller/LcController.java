package com.lc.v2.checker.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.infra.fields.FieldPoolRegistry;
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
 * LC-derived endpoints.
 *
 *   GET  /sessions/{id}/lc                — MT700 source view {text, fields, rawFields, warnings, fieldLabels}
 *   GET  /sessions/{id}/lc/required-docs  — :46A: parsed required-doc checklist
 */
@RestController
@RequestMapping("/api/v2/sessions/{sessionId}/lc")
public class LcController {

    private static final Logger log = LoggerFactory.getLogger(LcController.class);

    private final SessionStore sessionStore;
    private final Lc46aRequiredDocsParser parser;
    private final ObjectMapper objectMapper;
    private final PipelineService pipelineService;
    private final FieldPoolRegistry fieldPool;

    public LcController(SessionStore sessionStore, Lc46aRequiredDocsParser parser,
                         ObjectMapper objectMapper, PipelineService pipelineService,
                         FieldPoolRegistry fieldPool) {
        this.sessionStore = sessionStore;
        this.parser = parser;
        this.objectMapper = objectMapper;
        this.pipelineService = pipelineService;
        this.fieldPool = fieldPool;
    }

    private Map<String, String> labelsFor(java.util.Set<String> keys) {
        Map<String, String> labels = new LinkedHashMap<>();
        for (String k : keys) {
            fieldPool.byKey(k).ifPresent(fd -> {
                if (fd.nameEn() != null) labels.put(k, fd.nameEn());
            });
        }
        return labels;
    }

    /**
     * Returns the LC source view used by the Parse stage's MT700 pane:
     *   { text, fields, rawFields, warnings, fieldLabels }
     *
     * Source priority:
     *   1. live StageContext (in-memory, fastest path during pipeline run)
     *   2. v_lc_parse view (DB-backed, survives JVM restart)
     *   3. ctx.lcText only (very early — pipeline hasn't reached Parse yet)
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
            response.put("fieldLabels", labelsFor(lc.envelope().fields().keySet()));
            return ResponseEntity.ok(response);
        }

        // DB rehydration — read from v_lc_parse (pipeline_steps intake/lc_parse).
        Map<String, Object> view = sessionStore.getLcParse(sessionId);
        if (view != null) {
            String text = (String) view.get("raw_mt700");
            Map<String, Object> fields = parseObjectMap((String) view.get("fields"));
            Map<String, Object> rawFields = parseObjectMap((String) view.get("raw_fields"));
            List<Object> warnings = parseList((String) view.get("warnings"));
            response.put("text", text == null ? "" : text);
            response.put("fields", fields);
            response.put("rawFields", rawFields);
            response.put("warnings", warnings);
            response.put("fieldLabels", labelsFor(fields.keySet()));
            return ResponseEntity.ok(response);
        }

        // Pre-parse fallback: pipeline hasn't run intake yet.
        if (ctx != null && ctx.lcText != null) {
            response.put("text", ctx.lcText);
            response.put("fields", Map.of());
            response.put("rawFields", Map.of());
            response.put("warnings", List.of());
            response.put("fieldLabels", Map.of());
            return ResponseEntity.ok(response);
        }

        response.put("text", "");
        response.put("fields", Map.of());
        response.put("rawFields", Map.of());
        response.put("warnings", List.of());
        response.put("fieldLabels", Map.of());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/required-docs")
    public ResponseEntity<Map<String, Object>> requiredDocs(@PathVariable String sessionId) {
        Map<String, Object> session = sessionStore.getSession(sessionId);
        if (session == null) return ResponseEntity.notFound().build();

        // Reconstruct LC text from v_lc_parse if available.
        Map<String, Object> lcView = sessionStore.getLcParse(sessionId);
        String lcText = lcView == null ? "" : ((String) lcView.getOrDefault("raw_mt700", ""));
        Lc46aRequiredDocsParser.Result parsed = parser.parse(lcText);

        // Mark which required docs are present in the session.
        // LC: legacy uploads create a documents(LC) row; deal bundle only has
        // lc.txt parsed into pipeline_steps(segmentation/lc_parse) — not a doc row.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> docs = (List<Map<String, Object>>) session.get("documents");
        java.util.Set<String> presentTypes = new java.util.HashSet<>();
        if (docs != null) for (Map<String, Object> d : docs) {
            Object dt = d.get("doc_type");
            if (dt != null) presentTypes.add(dt.toString());
        }
        boolean lcParsed = false;
        if (lcView != null) {
            Object rawMt700 = lcView.get("raw_mt700");
            lcParsed = rawMt700 != null && !rawMt700.toString().isBlank();
        }

        List<Map<String, Object>> required = new java.util.ArrayList<>(parsed.required().size());
        for (var r : parsed.required()) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("type", r.type());
            entry.put("copies", r.copies());
            entry.put("label", r.label());
            boolean present = "LC".equals(r.type())
                    ? presentTypes.contains("LC") || lcParsed
                    : presentTypes.contains(r.type());
            entry.put("present", present);
            required.add(entry);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("parsed46A", parsed.parsed46A());
        response.put("required", required);
        return ResponseEntity.ok(response);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseObjectMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> m = objectMapper.readValue(json, Map.class);
            return m == null ? Map.of() : m;
        } catch (Exception e) {
            log.warn("LC field map parse failed: {}", e.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Object> parseList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Object> l = objectMapper.readValue(json, List.class);
            return l == null ? List.of() : l;
        } catch (Exception e) {
            return List.of();
        }
    }
}
