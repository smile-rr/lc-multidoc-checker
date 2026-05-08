package com.lc.v2.checker.pipeline;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.lc.LcParseResult;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.observability.SessionTraceRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.PdfBytesCache;
import com.lc.v2.checker.infra.stream.PipelineEventChannel;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Orchestrates session lifecycle for the officer-paced pipeline.
 *
 *   createSession()    — creates DB row, runs the FIRST stage (Intake) async
 *   runStage(sessionId, stage)
 *                      — runs the requested stage async (must match next_stage
 *                        unless rerun, in which case use rerunFromStage)
 *   rerunFromStage()   — wipes downstream rows + re-runs from the chosen stage
 *
 * After every successful stage (except the terminal Sign-off) the session
 * is marked AWAITING_OFFICER with next_stage set; the officer triggers the
 * next stage via the controller.
 */
@Service
public class PipelineService {

    private static final Logger log = LoggerFactory.getLogger(PipelineService.class);

    private final LcV2Pipeline pipeline;
    private final PipelineEventBus eventBus;
    private final PipelineEventChannel eventChannel;
    private final SessionStore sessionStore;
    private final DocTypeRegistry docTypeRegistry;
    private final ObjectMapper objectMapper;
    private final PdfBytesCache pdfCache;
    private final SessionTraceRegistry traceRegistry;

    /** Per-session context cache so stage runs can find prior in-memory state. */
    private final Map<String, StageContext> contextCache = new ConcurrentHashMap<>();

    @Lazy @Autowired private PipelineService self;

    public PipelineService(LcV2Pipeline pipeline, PipelineEventBus eventBus,
                           PipelineEventChannel eventChannel, SessionStore sessionStore,
                           DocTypeRegistry docTypeRegistry, ObjectMapper objectMapper,
                           PdfBytesCache pdfCache, SessionTraceRegistry traceRegistry) {
        this.pipeline = pipeline;
        this.eventBus = eventBus;
        this.eventChannel = eventChannel;
        this.sessionStore = sessionStore;
        this.docTypeRegistry = docTypeRegistry;
        this.objectMapper = objectMapper;
        this.pdfCache = pdfCache;
        this.traceRegistry = traceRegistry;
    }

    /**
     * Create a session and run the first stage (Intake). After Intake completes,
     * the session is marked AWAITING_OFFICER and waits for the officer to trigger
     * Parse via POST /sessions/{id}/stages/parse/run.
     */
    public String createSession(String lcText, Map<DocType, Map.Entry<String, byte[]>> documents) {
        String effectiveLcText = lcText;
        if ((effectiveLcText == null || effectiveLcText.isBlank()) && documents.containsKey(DocType.LC)) {
            byte[] lcBytes = documents.get(DocType.LC).getValue();
            if (lcBytes != null && lcBytes.length > 0) {
                effectiveLcText = new String(lcBytes, StandardCharsets.UTF_8);
            }
        }

        int docCount = documents.size() + (effectiveLcText != null && !effectiveLcText.isBlank()
                && !documents.containsKey(DocType.LC) ? 1 : 0);
        String sessionId = sessionStore.createSession(docCount);

        eventChannel.channel(sessionId);

        StageContext ctx = buildContext(sessionId, effectiveLcText, documents);
        contextCache.put(sessionId, ctx);

        // Per-session root span: all stage / LLM spans nest under it so one
        // session = one trace tree in Langfuse. Lifecycle (open, end on
        // terminal/fatal, re-attach on async stage runs) lives in
        // SessionTraceRegistry — pipeline code never touches a Tracer.
        traceRegistry.open(sessionId, Map.of("doc_count", String.valueOf(docCount)));

        // Kick off Intake. Subsequent stages require explicit officer triggers.
        self.runStageAsync(sessionId, ctx, 0);
        return sessionId;
    }

    private StageContext buildContext(String sessionId, String lcText,
                                       Map<DocType, Map.Entry<String, byte[]>> documents) {
        StageContext ctx = new StageContext(sessionId, eventBus);
        ctx.lcText = lcText;
        for (var e : documents.entrySet()) {
            ctx.uploadedDocBytes.put(e.getKey(), e.getValue().getValue());
            ctx.uploadedDocNames.put(e.getKey(), e.getValue().getKey());
        }
        return ctx;
    }

    /**
     * Officer-triggered stage advance. Validates the requested stage matches
     * the session's recorded next_stage. Returns:
     *   true  — stage queued and running async
     *   false — context not found (session evicted or never existed)
     *
     * Throws IllegalStateException for stage mismatch or signed sessions.
     */
    public boolean runStage(String sessionId, String stageName) {
        if (sessionStore.isSigned(sessionId)) {
            throw new IllegalStateException("Session is signed (frozen) — cannot advance");
        }
        StageContext ctx = contextCache.get(sessionId);
        if (ctx == null) {
            // Cache miss — typical after JVM restart. Try to rehydrate from DB
            // so the officer can resume forward progress without losing the
            // session. Post-Parse stages have all the inputs they need in
            // pipeline_steps; Intake/Parse still require raw PDF bytes which
            // are not persisted (PdfBytesCache is JVM-lifetime).
            ctx = rehydrateContext(sessionId);
            if (ctx == null || !canRehydrateForStage(ctx, stageName)) return false;
            contextCache.put(sessionId, ctx);
            traceRegistry.ensure(sessionId);
            log.info("[{}] rehydrated StageContext from DB for run stage={}", sessionId, stageName);
        }

        int idx = pipeline.indexOf(stageName);
        if (idx < 0) throw new IllegalArgumentException("Unknown stage: " + stageName);

        String expected = sessionStore.getNextStage(sessionId);
        if (expected != null && !expected.equalsIgnoreCase(stageName)) {
            throw new IllegalStateException(
                    "Stage mismatch: session is awaiting '" + expected + "', got '" + stageName + "'");
        }

        sessionStore.clearAwaitingOfficer(sessionId, stageName);
        self.runStageAsync(sessionId, ctx, idx);
        return true;
    }

    /**
     * Run a single stage async. After it completes, mark next_stage and emit
     * AwaitingOfficer (or finalise if it was Sign-off).
     */
    @Async
    public void runStageAsync(String sessionId, StageContext ctx, int idx) {
        String stageName = pipeline.nameAt(idx);
        // Re-attach the session root span on this async thread so any spans
        // started inside the stage (parse, examine, vision.generate, gen_ai.*)
        // inherit it as parent. The PipelineTracingAspect opens the per-stage
        // span automatically when Stage.execute is annotated with @PipelineStage.
        traceRegistry.runInSession(sessionId, () -> {
            try {
                sessionStore.updateStatus(sessionId, stageName.toUpperCase());
                boolean ok = pipeline.runOne(ctx, idx);
                if (!ok) {
                    if (ctx.hasFatalError()) {
                        sessionStore.updateFailed(sessionId, ctx.fatalError.getMessage());
                        traceRegistry.end(sessionId, ctx.fatalError.getMessage());
                    }
                    return;
                }

                // Terminal stage? Finalise.
                if (idx == pipeline.stageCount() - 1) {
                    finalize(sessionId, ctx);
                    return;
                }

                // Hard gate: pause and wait for officer.
                String nextStage = pipeline.nameAt(idx + 1);
                sessionStore.markAwaitingOfficer(sessionId, stageName, nextStage);
                eventBus.awaitingOfficer(sessionId, nextStage);
                log.info("[{}] stage={} complete; awaiting officer to trigger {}",
                        sessionId, stageName, nextStage);
            } catch (Exception e) {
                log.error("[{}] stage={} failed: {}", sessionId, stageName, e.getMessage(), e);
                sessionStore.updateFailed(sessionId, e.getMessage());
                traceRegistry.end(sessionId, e.getMessage());
            }
        });
    }

    private void finalize(String sessionId, StageContext ctx) {
        boolean compliant = ctx.checkResults.stream()
                .noneMatch(r -> r.verdict() == com.lc.v2.checker.domain.result.CheckResult.Verdict.FAIL
                        || r.verdict() == com.lc.v2.checker.domain.result.CheckResult.Verdict.DOUBTS);
        // Persist the assembled report as just another pipeline step. The
        // session-level scalars (status/compliant/completed_at) are updated
        // independently — there is no separate final_report column.
        if (ctx.finalReport != null) {
            try {
                String reportJson = objectMapper.writeValueAsString(ctx.finalReport);
                sessionStore.upsertPipelineStep(sessionId, "signoff", "report",
                        compliant ? "COMPLIANT" : "DISCREPANT", reportJson, null, null);
            } catch (Exception e) {
                log.warn("[{}] signoff report serialise failed: {}", sessionId, e.getMessage());
            }
        }
        sessionStore.updateCompleted(sessionId, compliant);
        traceRegistry.end(sessionId, null);
        if (sessionStore.isSigned(sessionId)) {
            eventChannel.complete(sessionId);
            contextCache.remove(sessionId);
        }
    }

    // ── Re-run (back-to-edit support) ──────────────────────────────────────

    public StageContext getContext(String sessionId) {
        return contextCache.get(sessionId);
    }

    /**
     * Re-run the pipeline starting from {@code fromStage}. Wipes downstream DB rows
     * + resets the relevant ctx fields, then runs ONE stage (the chosen one) and
     * pauses again awaiting officer trigger for the next.
     *
     * Used for "back to a prior stage to correct data" — officer goes back, edits
     * a field, and re-runs the affected stage. Subsequent stages are still officer-paced.
     */
    public boolean rerunFromStage(String sessionId, String fromStage, String officerId) {
        if (sessionStore.isSigned(sessionId)) {
            throw new IllegalStateException("Session is signed (frozen) — re-run not allowed");
        }
        StageContext ctx = contextCache.get(sessionId);
        if (ctx == null) {
            // Cache miss — typical after a JVM restart or sign-off eviction.
            // Rehydrate from DB so post-Parse stages (reconcile / examine /
            // signoff) can rerun without forcing the officer to re-upload.
            // Intake / Parse rerun still requires a fresh session because the
            // raw PDF bytes are not persisted in the data lake.
            ctx = rehydrateContext(sessionId);
            if (ctx == null || !canRehydrateForStage(ctx, fromStage)) return false;
            contextCache.put(sessionId, ctx);
            traceRegistry.ensure(sessionId);
            log.info("[{}] rehydrated StageContext from DB for rerun from stage={}",
                    sessionId, fromStage);
        }

        int idx = pipeline.indexOf(fromStage);
        if (idx < 0) throw new IllegalArgumentException("Unknown stage: " + fromStage);

        ctx.cancelled = false;
        ctx.cancelledAtStage = null;
        ctx.fatalError = null;

        sessionStore.clearDownstreamState(sessionId, fromStage);
        resetContextForStage(ctx, fromStage);

        eventBus.stageRerun(sessionId, fromStage, officerId);
        log.info("[{}] re-running from stage={} requested by {}", sessionId, fromStage, officerId);

        sessionStore.clearAwaitingOfficer(sessionId, fromStage);
        self.runStageAsync(sessionId, ctx, idx);
        return true;
    }

    /**
     * Rebuild a {@link StageContext} from persisted state. Used when the
     * in-memory cache has been evicted (JVM restart, sign-off cleanup) and
     * the officer wants to rerun a post-Parse stage. Raw PDF bytes are NOT
     * persisted, so this rehydrated context cannot drive Intake or Parse.
     */
    private StageContext rehydrateContext(String sessionId) {
        StageContext ctx = new StageContext(sessionId, eventBus);
        for (Map<String, Object> d : sessionStore.getDocuments(sessionId)) {
            String typeStr = (String) d.get("doc_type");
            if (typeStr == null) continue;
            DocType dt;
            try {
                dt = DocType.valueOf(typeStr);
            } catch (IllegalArgumentException ignore) {
                continue;
            }
            Object idObj = d.get("id");
            if (idObj != null) ctx.docIds.put(dt, idObj.toString());
            Object name = d.get("original_filename");
            if (name != null) ctx.uploadedDocNames.put(dt, name.toString());
            if (Boolean.TRUE.equals(d.get("confirmed_by_officer"))) {
                ctx.confirmedDocTypes.add(dt);
            }
        }
        Map<String, Object> lcRow = sessionStore.getLcParse(sessionId);
        if (lcRow != null) {
            try {
                Map<String, Object> fields = readJsonMap((String) lcRow.get("fields"));
                Map<String, String> rawFields = readJsonStringMap((String) lcRow.get("raw_fields"));
                String raw = (String) lcRow.get("raw_mt700");
                FieldEnvelope env = FieldEnvelope.builder().putAll(fields).build();
                ctx.lcText = raw;
                ctx.lc = new LcParseResult(env, raw, rawFields, List.of(), List.of(), null);
            } catch (Exception e) {
                log.warn("[{}] LC rehydration failed: {}", sessionId, e.getMessage());
            }
        }
        for (Map.Entry<DocType, String> entry : ctx.docIds.entrySet()) {
            Map<String, Object> consRow = sessionStore.getDocConsensus(entry.getValue());
            if (consRow == null) continue;
            try {
                Map<String, Object> fields = readJsonMap((String) consRow.get("fields"));
                FieldEnvelope env = FieldEnvelope.builder().putAll(fields).build();
                DocumentExtract.ExtractionConfidence conf = DocumentExtract.ExtractionConfidence.MED;
                Object oc = consRow.get("overall_confidence");
                if (oc instanceof Number n) {
                    double v = n.doubleValue();
                    conf = v >= 0.9 ? DocumentExtract.ExtractionConfidence.HIGH
                         : v >= 0.7 ? DocumentExtract.ExtractionConfidence.MED
                         : DocumentExtract.ExtractionConfidence.LOW;
                }
                DocumentExtract de = new DocumentExtract(
                        entry.getKey(), env, Map.of(), conf, List.of(),
                        ctx.uploadedDocNames.get(entry.getKey()), null, 0);
                ctx.extracts.put(entry.getKey(), de);
            } catch (Exception e) {
                log.warn("[{}] consensus rehydration failed for {}: {}",
                        sessionId, entry.getKey(), e.getMessage());
            }
        }
        return ctx;
    }

    private boolean canRehydrateForStage(StageContext ctx, String fromStage) {
        if (ctx == null) return false;
        String s = fromStage == null ? "" : fromStage.toLowerCase();
        return switch (s) {
            case "reconcile", "examine", "signoff" -> ctx.lc != null && !ctx.extracts.isEmpty();
            default -> false; // intake/parse need raw PDF bytes
        };
    }

    private Map<String, Object> readJsonMap(String json) throws Exception {
        if (json == null || json.isBlank()) return Map.of();
        return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
    }

    private Map<String, String> readJsonStringMap(String json) throws Exception {
        if (json == null || json.isBlank()) return Map.of();
        return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
    }

    private void resetContextForStage(StageContext ctx, String fromStage) {
        String stage = fromStage == null ? "" : fromStage.toLowerCase();
        if (stage.equals("intake")) {
            pdfCache.evictSession(new java.util.ArrayList<>(ctx.docIds.values()));
            ctx.docIds.clear();
            ctx.confirmedDocTypes.clear();
        }
        if (stage.equals("intake") || stage.equals("parse")) {
            ctx.lc = null;
            ctx.extracts.clear();
        }
        if (stage.equals("intake") || stage.equals("parse") || stage.equals("reconcile")) {
            ctx.reconFields = null;
            ctx.reconLocked = false;
        }
        if (stage.equals("intake") || stage.equals("parse") || stage.equals("reconcile") || stage.equals("examine")) {
            ctx.checkResults.clear();
        }
        ctx.finalReport = null;
    }
}
