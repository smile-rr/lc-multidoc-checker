package com.lc.v2.checker.pipeline;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Single emitter for pipeline lifecycle events.
 * Both the SSE stream adapter and PipelineTracingAspect subscribe via Spring's event system.
 * Business code calls this; neither SSE nor tracing code appears in stages.
 */
@Component
public class PipelineEventBus {

    private static final Logger log = LoggerFactory.getLogger(PipelineEventBus.class);
    private final ApplicationEventPublisher publisher;

    public PipelineEventBus(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    public void emit(PipelineEvent event) {
        log.debug("[{}] event={}", event.sessionId(), event.getClass().getSimpleName());
        publisher.publishEvent(event);
    }

    /** Alias for emit() — shorthand for direct event publishing. */
    public void publish(PipelineEvent event) { emit(event); }

    public void stageStarted(String sessionId, String stageName) {
        emit(new PipelineEvent.StageStarted(sessionId, stageName, java.time.Instant.now()));
    }

    public void stageCompleted(String sessionId, String stageName, long durationMs) {
        emit(new PipelineEvent.StageCompleted(sessionId, stageName, durationMs, java.time.Instant.now()));
    }

    /** Convenience overload — emits completed with 0 duration and logs the note. */
    public void stageCompleted(String sessionId, String stageName, String note) {
        log.info("[{}] stage={} completed note={}", sessionId, stageName, note);
        emit(new PipelineEvent.StageCompleted(sessionId, stageName, 0L, java.time.Instant.now()));
    }

    public void stageFailed(String sessionId, String stageName, String error) {
        emit(new PipelineEvent.StageFailed(sessionId, stageName, error, java.time.Instant.now()));
    }

    public void ruleStarted(String sessionId, String ruleId, String label, int index, int total, String checkType) {
        emit(new PipelineEvent.RuleStarted(sessionId, ruleId, label, index, total, checkType, java.time.Instant.now()));
    }

    public void ruleChecked(String sessionId, String ruleId, String verdict, double confidence) {
        emit(new PipelineEvent.RuleChecked(sessionId, ruleId, verdict, confidence, java.time.Instant.now()));
    }

    public void ruleChecked(String sessionId, String ruleId, String verdict, double confidence,
                            String origin, String triggerOutcome, java.util.List<String> triggerTrace) {
        emit(new PipelineEvent.RuleChecked(sessionId, ruleId, verdict, confidence,
                origin, triggerOutcome, triggerTrace, java.time.Instant.now()));
    }

    public void extractionProgress(String sessionId, String docType, String slot, String status) {
        emit(new PipelineEvent.ExtractionProgress(sessionId, docType, slot, status, java.time.Instant.now()));
    }

    public void sessionCompleted(String sessionId, boolean compliant, int discrepancies) {
        emit(new PipelineEvent.SessionCompleted(sessionId, compliant, discrepancies, java.time.Instant.now()));
    }

    public void sessionCancelled(String sessionId, String atStage) {
        emit(new PipelineEvent.SessionCancelled(sessionId, atStage, java.time.Instant.now()));
    }

    public void stageRerun(String sessionId, String fromStage, String officerId) {
        emit(new PipelineEvent.StageRerun(sessionId, fromStage, officerId, java.time.Instant.now()));
    }

    public void awaitingOfficer(String sessionId, String stage) {
        emit(new PipelineEvent.AwaitingOfficer(sessionId, stage, java.time.Instant.now()));
    }

    public void reconcileCellDecided(String sessionId, String fieldKey, String docType,
                                      String decision, String note, String officerId) {
        emit(new PipelineEvent.ReconcileCellDecided(sessionId, fieldKey, docType, decision, note, officerId, java.time.Instant.now()));
    }

    public void reconcileCellCleared(String sessionId, String fieldKey, String docType, String officerId) {
        emit(new PipelineEvent.ReconcileCellCleared(sessionId, fieldKey, docType, officerId, java.time.Instant.now()));
    }

    // ── Officer-action helpers ─────────────────────────────────────────────
    public void docTypeChanged(String sessionId, String docId, String newType, String officerId) {
        emit(new PipelineEvent.DocTypeChanged(sessionId, docId, newType, officerId, java.time.Instant.now()));
    }

    public void docReviewed(String sessionId, String docId, String officerId) {
        emit(new PipelineEvent.DocReviewed(sessionId, docId, officerId, java.time.Instant.now()));
    }

    public void fieldCorrected(String sessionId, String docId, String fieldKey, String value, String issueKind, String officerId) {
        emit(new PipelineEvent.FieldCorrected(sessionId, docId, fieldKey, value, issueKind, officerId, java.time.Instant.now()));
    }

    public void reconcileTriaged(String sessionId, String fieldKey, String decision, String officerId) {
        emit(new PipelineEvent.ReconcileTriaged(sessionId, fieldKey, decision, officerId, java.time.Instant.now()));
    }

    public void locked(String sessionId, String officerId) {
        emit(new PipelineEvent.Locked(sessionId, officerId, java.time.Instant.now()));
    }

    public void unlocked(String sessionId, String officerId, String reason) {
        emit(new PipelineEvent.Unlocked(sessionId, officerId, reason, java.time.Instant.now()));
    }

    public void ruleOverridden(String sessionId, String ruleId, String newStatus, String reason, boolean flagged, String officerId) {
        emit(new PipelineEvent.RuleOverridden(sessionId, ruleId, newStatus, reason, flagged, officerId, java.time.Instant.now()));
    }

    public void overrideCleared(String sessionId, String ruleId, String officerId) {
        emit(new PipelineEvent.OverrideCleared(sessionId, ruleId, officerId, java.time.Instant.now()));
    }

    public void signedOff(String sessionId, String decision, String officerId) {
        emit(new PipelineEvent.SignedOff(sessionId, decision, officerId, java.time.Instant.now()));
    }

}
