package com.lc.v2.checker.pipeline;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.infra.fields.DocTypeRegistry;
import com.lc.v2.checker.infra.persistence.SessionStore;
import com.lc.v2.checker.infra.storage.PdfBytesCache;
import com.lc.v2.checker.infra.stream.PipelineEventChannel;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Orchestrates session lifecycle: creates DB record, populates StageContext,
 * fires pipeline async, updates session on completion.
 *
 * Iteration-2 additions:
 *   - In-memory {@link #contextCache} keeps StageContext alive after the first
 *     pipeline run so officers can re-run from a chosen stage without losing
 *     uploaded bytes / extraction results.
 *   - {@link #cancel(String, String)} flips the cancellation flag (cooperative
 *     soft cancel between stages).
 *   - {@link #rerunFromStage(String, String, String)} clears downstream rows
 *     and replays from the chosen stage.
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

    /** Per-session context cache so re-run can find the in-memory state. */
    private final Map<String, StageContext> contextCache = new ConcurrentHashMap<>();

    // Self-injection via @Lazy breaks the circular dependency and ensures @Async
    // invocations go through the Spring proxy rather than bypassing it via this.runAsync().
    @Lazy @Autowired private PipelineService self;

    public PipelineService(LcV2Pipeline pipeline, PipelineEventBus eventBus,
                           PipelineEventChannel eventChannel, SessionStore sessionStore,
                           DocTypeRegistry docTypeRegistry, ObjectMapper objectMapper,
                           PdfBytesCache pdfCache) {
        this.pipeline = pipeline;
        this.eventBus = eventBus;
        this.eventChannel = eventChannel;
        this.sessionStore = sessionStore;
        this.docTypeRegistry = docTypeRegistry;
        this.objectMapper = objectMapper;
        this.pdfCache = pdfCache;
    }

    /**
     * Create a session record and return its ID immediately.
     * The pipeline runs async — callers subscribe to SSE for progress.
     *
     * @param lcText      raw MT700 text (from the LC textarea field)
     * @param documents   map of classified DocType → (filename, pdfBytes)
     */
    public String createSession(String lcText, Map<DocType, Map.Entry<String, byte[]>> documents) {
        // If lcText is empty but the documents map carries an LC entry (.txt upload),
        // pull the LC text out of its bytes so MT700 parse + :46A: required-docs work.
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

        // Pre-create the SSE channel so subscribers can connect before pipeline starts
        eventChannel.channel(sessionId);

        StageContext ctx = buildContext(sessionId, effectiveLcText, documents);
        contextCache.put(sessionId, ctx);

        // Call through self (the proxied bean) so @Async is honoured
        self.runAsync(sessionId, ctx, /*finalRun*/ true);
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

    @Async
    public void runAsync(String sessionId, StageContext ctx, boolean finalRun) {
        try {
            sessionStore.updateStatus(sessionId, "INTAKE");
            pipeline.run(ctx);
            finalize(sessionId, ctx);
        } catch (Exception e) {
            log.error("[{}] Pipeline failed: {}", sessionId, e.getMessage(), e);
            sessionStore.updateFailed(sessionId, e.getMessage());
        } finally {
            // For re-run support, we keep the SSE channel alive across runs.
            // The channel only closes when the session is signed (frozen) or
            // the JVM evicts it. Officers can re-run multiple times.
            if (finalRun && sessionStore.isSigned(sessionId)) {
                eventChannel.complete(sessionId);
                contextCache.remove(sessionId);
            }
        }
    }

    private void finalize(String sessionId, StageContext ctx) {
        if (ctx.cancelled) {
            sessionStore.updateStatus(sessionId, "CANCELLED");
            log.info("[{}] Session cancelled at stage={}", sessionId, ctx.cancelledAtStage);
            return;
        }
        boolean compliant = ctx.checkResults.stream()
                .noneMatch(r -> r.verdict() == com.lc.v2.checker.domain.result.CheckResult.Verdict.FAIL
                        || r.verdict() == com.lc.v2.checker.domain.result.CheckResult.Verdict.DOUBTS);
        String reportJson = null;
        if (ctx.finalReport != null) {
            try { reportJson = objectMapper.writeValueAsString(ctx.finalReport); } catch (Exception ignored) {}
        }
        sessionStore.updateCompleted(sessionId, compliant, reportJson);
    }

    // ── Cancel + Re-run ────────────────────────────────────────────────────

    public StageContext getContext(String sessionId) {
        return contextCache.get(sessionId);
    }

    /** Soft cancel: flag the context; current stage runs to completion, then loop exits. */
    public boolean cancel(String sessionId, String officerId) {
        StageContext ctx = contextCache.get(sessionId);
        if (ctx == null) return false;
        ctx.cancelled = true;
        log.info("[{}] cancellation requested by {} (cooperative)", sessionId, officerId);
        return true;
    }

    /**
     * Re-run the pipeline starting from {@code fromStage}. Wipes downstream DB rows
     * + resets the relevant ctx fields, then replays from the stage onwards.
     * Returns false if no in-memory context (re-run unavailable; client should
     * start a fresh session).
     */
    public boolean rerunFromStage(String sessionId, String fromStage, String officerId) {
        if (sessionStore.isSigned(sessionId)) {
            throw new IllegalStateException("Session is signed (frozen) — re-run not allowed");
        }
        StageContext ctx = contextCache.get(sessionId);
        if (ctx == null) {
            return false;
        }
        int idx = pipeline.indexOf(fromStage);
        if (idx < 0) {
            throw new IllegalArgumentException("Unknown stage: " + fromStage);
        }

        // Reset the cancellation flag so a previous cancel doesn't immediately abort the rerun.
        ctx.cancelled = false;
        ctx.cancelledAtStage = null;
        ctx.fatalError = null;

        // Wipe DB rows for fromStage and downstream
        sessionStore.clearDownstreamState(sessionId, fromStage);

        // Reset the matching ctx fields + PDF cache when intake is being replayed
        resetContextForStage(ctx, fromStage);

        eventBus.stageRerun(sessionId, fromStage, officerId);
        log.info("[{}] re-running from stage={} requested by {}", sessionId, fromStage, officerId);

        self.replayAsync(sessionId, ctx, idx);
        return true;
    }

    @Async
    public void replayAsync(String sessionId, StageContext ctx, int fromIdx) {
        try {
            pipeline.runFrom(ctx, fromIdx);
            finalize(sessionId, ctx);
        } catch (Exception e) {
            log.error("[{}] Re-run failed: {}", sessionId, e.getMessage(), e);
            sessionStore.updateFailed(sessionId, e.getMessage());
        }
    }

    private void resetContextForStage(StageContext ctx, String fromStage) {
        String stage = fromStage == null ? "" : fromStage.toLowerCase();
        if (stage.equals("intake")) {
            // Evict PDF cache entries before clearing the docIds → byte mapping
            pdfCache.evictSession(new java.util.ArrayList<>(ctx.docIds.values()));
            ctx.docIds.clear();
            ctx.confirmedDocTypes.clear();
            // ctx.uploadedDocBytes / uploadedDocNames are kept — they're the original upload
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
