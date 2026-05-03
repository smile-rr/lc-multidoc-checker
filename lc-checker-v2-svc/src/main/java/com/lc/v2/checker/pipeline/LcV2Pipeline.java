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
 * Each stage is gated: failure stops the pipeline and emits a StageFailed event.
 *
 * Two entry points:
 *   run(ctx)               — full pipeline from intake through sign-off
 *   runFrom(ctx, idx)      — partial re-run starting at the given stage index
 *
 * Cooperative cancellation: ctx.cancelled is checked between stages. Set the
 * flag (e.g. via PipelineService.cancel) and the loop will exit after the
 * currently-running stage completes; LLM HTTP calls are not interrupted.
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

    public void run(StageContext ctx) {
        runFrom(ctx, 0);
    }

    public void runFrom(StageContext ctx, int fromIdx) {
        for (int i = Math.max(0, fromIdx); i < stages.size(); i++) {
            Stage stage = stages.get(i);
            if (ctx.cancelled) {
                log.info("[{}] cancellation observed before stage={}", ctx.sessionId, stage.name());
                ctx.cancelledAtStage = stage.name();
                eventBus.sessionCancelled(ctx.sessionId, stage.name());
                return;
            }
            if (ctx.hasFatalError()) break;
            try {
                stage.execute(ctx);
            } catch (Exception e) {
                ctx.fatalError = e;
                log.error("[{}] stage={} failed: {}", ctx.sessionId, stage.name(), e.getMessage(), e);
                eventBus.stageFailed(ctx.sessionId, stage.name(), e.getMessage());
                break;
            }
        }
        // sessionCompleted is emitted by SignoffStage; only emit here on fatal failure path
        if (ctx.hasFatalError()) {
            eventBus.sessionCompleted(ctx.sessionId, false, 0);
        }
    }
}
