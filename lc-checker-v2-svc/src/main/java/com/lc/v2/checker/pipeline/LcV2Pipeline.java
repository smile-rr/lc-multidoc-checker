package com.lc.v2.checker.pipeline;

import com.lc.v2.checker.stage.examine.ExamineStage;
import com.lc.v2.checker.stage.intake.IntakeStage;
import com.lc.v2.checker.stage.parse.ParseStage;
import com.lc.v2.checker.stage.reconcile.ReconcileStage;
import com.lc.v2.checker.stage.signoff.SignoffStage;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Orchestrates the 5-stage v2 pipeline: Intake → Parse → Reconcile → Examine → Sign-off.
 *
 * Each stage is hard-gated: the pipeline runs ONE stage per invocation, then
 * returns. The officer triggers the next stage explicitly via
 * POST /sessions/{id}/stages/{stage}/run. This decouples pipeline throughput
 * from officer cadence and matches LC-checking workflow where officers control
 * progression and may go back to a prior stage to correct data.
 *
 * Two entry points:
 *   runOne(ctx, idx)       — run a single stage at the given index
 *   runFrom(ctx, idx)      — DEV/legacy: run all stages from idx onwards (no gates)
 */
@Component
public class LcV2Pipeline {

    private static final Logger log = LoggerFactory.getLogger(LcV2Pipeline.class);

    private final List<Stage> stages;
    private final PipelineEventBus eventBus;

    public LcV2Pipeline(
            IntakeStage intake,
            ParseStage parse,
            ReconcileStage reconcile,
            ExamineStage examine,
            SignoffStage signoff,
            PipelineEventBus eventBus) {
        this.stages = List.of(intake, parse, reconcile, examine, signoff);
        this.eventBus = eventBus;
    }

    public List<Stage> stages() { return stages; }

    /** Find a stage's position by name; -1 if not found. */
    public int indexOf(String stageName) {
        for (int i = 0; i < stages.size(); i++) {
            if (stages.get(i).name().equalsIgnoreCase(stageName)) return i;
        }
        return -1;
    }

    /** Stage name at the given index, or null. */
    public String nameAt(int idx) {
        return (idx >= 0 && idx < stages.size()) ? stages.get(idx).name() : null;
    }

    public int stageCount() { return stages.size(); }

    /**
     * Run a single stage. Returns true on success, false if a fatal error or
     * cancellation prevented execution. Caller is responsible for setting
     * next-stage state in the SessionStore after this returns.
     */
    public boolean runOne(StageContext ctx, int idx) {
        if (idx < 0 || idx >= stages.size()) {
            throw new IllegalArgumentException("stage index out of range: " + idx);
        }
        Stage stage = stages.get(idx);
        if (ctx.cancelled) {
            log.info("[{}] cancellation observed before stage={}", ctx.sessionId, stage.name());
            ctx.cancelledAtStage = stage.name();
            eventBus.sessionCancelled(ctx.sessionId, stage.name());
            return false;
        }
        if (ctx.hasFatalError()) return false;
        try {
            stage.execute(ctx);
            return true;
        } catch (Exception e) {
            ctx.fatalError = e;
            log.error("[{}] stage={} failed: {}", ctx.sessionId, stage.name(), e.getMessage(), e);
            eventBus.stageFailed(ctx.sessionId, stage.name(), e.getMessage());
            return false;
        }
    }

    /**
     * Run all stages from {@code fromIdx} onwards in one go.
     * Used by re-run from a stage; the standard officer-paced flow uses
     * {@link #runOne(StageContext, int)} per stage.
     */
    public void runFrom(StageContext ctx, int fromIdx) {
        for (int i = Math.max(0, fromIdx); i < stages.size(); i++) {
            if (!runOne(ctx, i)) break;
        }
        if (ctx.hasFatalError()) {
            eventBus.sessionCompleted(ctx.sessionId, false, 0);
        }
    }
}
