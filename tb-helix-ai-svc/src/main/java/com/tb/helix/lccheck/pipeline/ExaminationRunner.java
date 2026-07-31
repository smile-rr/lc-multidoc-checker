package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.error.ConflictException;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.infra.pipeline.PipelineEngine;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Orchestration, and the officer's control of it.
 *
 * <p>Only intake runs by itself. Every later stage waits at {@code awaiting_officer} until
 * a person asks for it — this is a regulated examination, and a pipeline that ran to
 * completion on upload would be presenting conclusions nobody chose to reach.
 *
 * <p>Stages hold no state between calls. Everything a stage needs it reads from the
 * database and the blob store through its context, so any instance can resume any case
 * after a restart. The only in-memory state here is a cancellation flag, and losing it
 * costs a run that keeps going rather than a case that cannot continue.
 */
@Service
public class ExaminationRunner {

    private static final Logger log = LoggerFactory.getLogger(ExaminationRunner.class);

    private final DocCheckPipeline pipeline;
    private final CaseStore cases;
    private final EventBus events;
    private final Map<String, Boolean> cancelled = new ConcurrentHashMap<>();

    public ExaminationRunner(DocCheckPipeline pipeline, CaseStore cases, EventBus events) {
        this.pipeline = pipeline;
        this.cases = cases;
        this.events = events;
        log.info("Pipeline stages: {}", pipeline.order().stream().map(StageId::key).toList());
    }

    /**
     * Runs a stage the officer asked for.
     *
     * <p>Asking for {@link StageId#PLAN} runs the gate first. The gate is a stage in the
     * code and a step on the wire, but not a button: "check whether the credit has expired,
     * but do not plan anything" is not a thing anyone wants.
     */
    public void runStage(String caseId, StageId requested, String officerId) {
        CaseRow row = cases.find(caseId)
                .orElseThrow(() -> new NotFoundException("case", caseId));

        String expected = row.nextStage();
        if (expected != null && !expected.equals(requested.key())) {
            throw new ConflictException(
                    "This case is waiting at " + expected + ", not " + requested.key() + ".",
                    "stage_mismatch");
        }
        if (row.halted()) {
            throw new ConflictException(
                    "A hard check stopped this examination. Override it before running anything further.",
                    "gate_halted");
        }

        cases.recordAction(caseId, "run_stage", requested.key(), Map.of(), officerId, null);
        cancelled.remove(caseId);
        executeAsync(caseId, requested, officerId);
    }

    /** Reruns a stage, clearing what it invalidates downstream. */
    public void rerunStage(String caseId, StageId stage, String officerId) {
        cases.find(caseId).orElseThrow(() -> new NotFoundException("case", caseId));
        cases.clearFrom(caseId, stage);
        cases.patchCase(caseId, Map.of("gate_halted", false));
        cases.recordAction(caseId, "rerun_stage", stage.key(), Map.of(), officerId, null);
        cancelled.remove(caseId);
        executeAsync(caseId, stage, officerId);
    }

    /**
     * Runs a stage now, without asking whether it was the officer's turn.
     *
     * <p>The entry {@link #runStage} uses once its checks have passed, and the one intake
     * uses on upload — intake is nobody's turn, it is what happens when files arrive.
     *
     * <p>Every caller is another bean, which is what makes {@code @Async} take effect: the
     * annotation is honoured by the proxy, so a self-call inside this class would quietly
     * run on the request thread and put the hang back.
     */
    @Async
    public void executeAsync(String caseId, StageId requested, String officerId) {
        // The gate rides with plan, so an expired credit stops the run before the
        // expensive half rather than after it.
        List<StageId> toRun = requested == StageId.PLAN
                ? List.of(StageId.GATE, StageId.PLAN)
                : List.of(requested);

        for (StageId id : toRun) {
            Optional<Stage> stage = pipeline.stage(id);
            if (stage.isEmpty()) {
                log.warn("No implementation for stage {} — skipping", id.key());
                continue;
            }
            StepResult outcome = runOne(caseId, stage.get(), officerId);
            if (!outcome.canContinue()) return;
        }

        StageId last = toRun.get(toRun.size() - 1);
        // The next stage the officer can ask for, not simply the next in the pipeline:
        // GATE sits between interpret and plan but has no button, and parking a case at
        // "waiting for gate" leaves it waiting for something that cannot be pressed.
        StageId next = last.nextOfficerStage().orElse(null);

        cases.setStage(caseId, last, next, next != null);
        if (next != null) {
            events.publish(HelixEvent.of(caseId, HelixEvent.AWAITING_OFFICER, Map.of("next", next.key())));
        } else {
            cases.patchCase(caseId, Map.of("status", "with_authoriser"));
        }
    }

    private StepResult runOne(String caseId, Stage stage, String officerId) {
        StageId id = stage.id();
        events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_STARTED, Map.of("stage", id.key())));
        long started = System.currentTimeMillis();
        StageContext ctx = new DbStageContext(caseId, id, officerId, cases, events, cancelled);

        try {
            StepResult outcome = PipelineEngine.run(stage, ctx);
            long ms = System.currentTimeMillis() - started;

            switch (outcome.status()) {
                case OK -> {
                    events.publish(HelixEvent.of(caseId, HelixEvent.STEP_DONE,
                            Map.of("stepId", id.key(), "ms", ms)));
                    events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_DONE, Map.of("stage", id.key())));
                }
                case HALTED -> {
                    // Not a failure. The system did exactly what it was asked to, and the
                    // answer is that this presentation cannot be accepted.
                    cases.patchCase(caseId, Map.of(
                            "gate_halted", true,
                            "gate_halt_check_id", String.valueOf(outcome.haltKey()),
                            "status", "discrepancies"));
                    events.publish(HelixEvent.of(caseId, HelixEvent.GATE_HALTED, Map.of(
                            "checkId", String.valueOf(outcome.haltKey()),
                            "statement", String.valueOf(outcome.detail()))));
                    log.info("Case {} halted at {} by {}", caseId, id.key(), outcome.haltKey());
                }
                case FAILED -> {
                    cases.patchCase(caseId, Map.of("error", String.valueOf(outcome.detail())));
                    events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_FAILED,
                            Map.of("stage", id.key(), "message", String.valueOf(outcome.detail()))));
                }
            }
            return outcome;

        } catch (RuntimeException e) {
            log.error("Stage {} threw for case {}", id.key(), caseId, e);
            cases.recordStep(caseId, id.key(), "-", "FAILED", null, e.toString(), false, null);
            cases.patchCase(caseId, Map.of("error", String.valueOf(e.getMessage())));
            events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_FAILED,
                    Map.of("stage", id.key(), "message", String.valueOf(e.getMessage()))));
            return StepResult.failed(e.getMessage());
        }
    }


    public void cancel(String caseId) {
        cancelled.put(caseId, true);
    }

    /** What the pipeline is, for anything that needs to show it rather than run it. */
    public DocCheckPipeline pipeline() {
        return pipeline;
    }
}
