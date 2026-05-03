package com.lc.v2.checker.pipeline;

import java.time.Instant;

/**
 * Base event emitted by stages and officer-action endpoints through PipelineEventBus.
 * Consumed by both the SSE emitter and PipelineTracingAspect.
 *
 * Pipeline events: emitted by stages during automated execution.
 * Officer events:  emitted by REST controllers when officers take action
 *                  (correct field, triage, lock, override, sign-off…).
 */
public sealed interface PipelineEvent permits
        PipelineEvent.StageStarted,
        PipelineEvent.StageCompleted,
        PipelineEvent.StageFailed,
        PipelineEvent.RuleStarted,
        PipelineEvent.RuleChecked,
        PipelineEvent.ExtractionProgress,
        PipelineEvent.SessionCompleted,
        PipelineEvent.SessionCancelled,
        PipelineEvent.StageRerun,
        PipelineEvent.AwaitingOfficer,
        PipelineEvent.ReconcileCellDecided,
        PipelineEvent.ReconcileCellCleared,
        PipelineEvent.DocTypeChanged,
        PipelineEvent.DocReviewed,
        PipelineEvent.FieldCorrected,
        PipelineEvent.ReconcileTriaged,
        PipelineEvent.Locked,
        PipelineEvent.Unlocked,
        PipelineEvent.RuleOverridden,
        PipelineEvent.OverrideCleared,
        PipelineEvent.SignedOff,
        PipelineEvent.ExaminePhase {

    String sessionId();
    Instant timestamp();

    /** Assigned by {@link com.lc.v2.checker.infra.stream.PipelineEventChannel} at publish time. */
    default long seq() { return 0; }

    // ── Pipeline lifecycle ─────────────────────────────────────────────────
    record StageStarted(String sessionId, String stageName, Instant timestamp) implements PipelineEvent {}
    record StageCompleted(String sessionId, String stageName, long durationMs, Instant timestamp) implements PipelineEvent {}
    record StageFailed(String sessionId, String stageName, String error, Instant timestamp) implements PipelineEvent {}
    record RuleStarted(String sessionId, String ruleId, String label, int index, int total, String checkType, Instant timestamp) implements PipelineEvent {}
    record RuleChecked(String sessionId, String ruleId, String verdict, double confidence,
                       String origin, String triggerOutcome, java.util.List<String> triggerTrace,
                       Instant timestamp) implements PipelineEvent {
        public RuleChecked {
            triggerTrace = triggerTrace == null ? java.util.List.of() : java.util.List.copyOf(triggerTrace);
        }
        // Back-compat constructor for legacy emit sites that have no trigger metadata.
        public RuleChecked(String sessionId, String ruleId, String verdict, double confidence, Instant timestamp) {
            this(sessionId, ruleId, verdict, confidence, "CATALOG", "FIRE", java.util.List.of(), timestamp);
        }
    }
    record ExtractionProgress(String sessionId, String docType, String slot, String status, Instant timestamp) implements PipelineEvent {}
    record SessionCompleted(String sessionId, boolean compliant, int discrepancies, Instant timestamp) implements PipelineEvent {}
    record SessionCancelled(String sessionId, String atStage, Instant timestamp) implements PipelineEvent {}
    record StageRerun(String sessionId, String fromStage, String officerId, Instant timestamp) implements PipelineEvent {}
    record AwaitingOfficer(String sessionId, String stage, Instant timestamp) implements PipelineEvent {}
    record ReconcileCellDecided(String sessionId, String fieldKey, String docType, String decision, String note, String officerId, Instant timestamp) implements PipelineEvent {}
    record ReconcileCellCleared(String sessionId, String fieldKey, String docType, String officerId, Instant timestamp) implements PipelineEvent {}

    // ── Officer actions ────────────────────────────────────────────────────
    record DocTypeChanged(String sessionId, String docId, String newType, String officerId, Instant timestamp) implements PipelineEvent {}
    record DocReviewed(String sessionId, String docId, String officerId, Instant timestamp) implements PipelineEvent {}
    record FieldCorrected(String sessionId, String docId, String fieldKey, String value, String issueKind, String officerId, Instant timestamp) implements PipelineEvent {}
    record ReconcileTriaged(String sessionId, String fieldKey, String decision, String officerId, Instant timestamp) implements PipelineEvent {}
    record Locked(String sessionId, String officerId, Instant timestamp) implements PipelineEvent {}
    record Unlocked(String sessionId, String officerId, String reason, Instant timestamp) implements PipelineEvent {}
    record RuleOverridden(String sessionId, String ruleId, String newStatus, String reason, boolean flagged, String officerId, Instant timestamp) implements PipelineEvent {}
    record OverrideCleared(String sessionId, String ruleId, String officerId, Instant timestamp) implements PipelineEvent {}
    record SignedOff(String sessionId, String decision, String officerId, Instant timestamp) implements PipelineEvent {}

    /** Examine sub-stage transition: derive | plan | check | review.
     *  durationMs = ms spent on the named phase up to this transition (null if unknown).
     *  total      = total rules to check (only set on phase=="check").
     *  adhocCount = ad-hoc rules proposed (only set on phase=="plan"). */
    record ExaminePhase(String sessionId, String phase, Long durationMs,
                        Integer total, Integer adhocCount, Instant timestamp)
            implements PipelineEvent {}
}
