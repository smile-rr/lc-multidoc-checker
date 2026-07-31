package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.error.ConflictException;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.infra.pipeline.PipelineEngine;
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
        log.info("Pipeline stages: {}", pipeline.phases().stream().map(p -> p.key()).toList());
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
        cases.clearFrom(caseId, stage, pipeline.after(stage));
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
        // Which stages run is the pipeline's answer — asking for the plan also runs the gate,
        // because the gate declares itself WITH_NEXT. Walking them is the engine's. What is
        // left here is what happens afterwards, and that is all policy.
        List<Stage> toRun = pipeline.runFor(requested);
        if (toRun.isEmpty()) {
            log.warn("No implementation for stage {} — nothing to run", requested.key());
            return;
        }

        PipelineEngine.Outcome outcome;
        try {
            outcome = PipelineEngine.run(toRun,
                    phase -> new DbStageContext(caseId, ((Stage) phase).id(), officerId, cases, events, cancelled));
        } catch (RuntimeException e) {
            // A step threw rather than returning a failure. Either way the case must not be
            // left looking busy forever — this runs on a pool thread, so an escaping
            // exception would be swallowed and the officer would watch a spinner.
            log.error("Stage {} threw for case {}", requested.key(), caseId, e);
            cases.recordStep(caseId, requested.key(), "-", "FAILED", null, e.toString(), false, null);
            fail(caseId, requested, e.getMessage());
            return;
        }

        StageId last = StageId.fromKey(outcome.lastPhase()).orElse(requested);
        switch (outcome.result().status()) {
            case HALTED -> halt(caseId, last, outcome.result());
            case FAILED -> fail(caseId, last, outcome.result().detail());
            default -> awaitOfficer(caseId, last);
        }
    }

    /**
     * A hard check stopped the examination.
     *
     * <p>Not a failure. The system did exactly what it was asked to, and the answer is that
     * this presentation cannot be accepted — so it becomes a discrepancy on the case rather
     * than an error, and the officer has to override it deliberately to go on.
     */
    private void halt(String caseId, StageId at, StepResult result) {
        cases.patchCase(caseId, Map.of(
                "gate_halted", true,
                "gate_halt_check_id", String.valueOf(result.haltKey()),
                "status", "discrepancies"));
        events.publish(HelixEvent.of(caseId, HelixEvent.GATE_HALTED, Map.of(
                "checkId", String.valueOf(result.haltKey()),
                "statement", String.valueOf(result.detail()))));
        log.info("Case {} halted at {} by {}", caseId, at.key(), result.haltKey());
    }

    private void fail(String caseId, StageId at, String detail) {
        cases.patchCase(caseId, Map.of("error", String.valueOf(detail)));
        events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_FAILED,
                Map.of("stage", at.key(), "message", String.valueOf(detail))));
    }

    /**
     * Hands the case back to a person.
     *
     * <p>The officer-paced pipeline in one method: a stage finished, so the case parks at the
     * next stage somebody can ask for, and waits. When there is no next, the examination is
     * over and it goes to the authoriser.
     */
    private void awaitOfficer(String caseId, StageId last) {
        StageId next = pipeline.nextOfficerStageAfter(last).orElse(null);
        cases.setStage(caseId, last, next, next != null);
        if (next != null) {
            events.publish(HelixEvent.of(caseId, HelixEvent.AWAITING_OFFICER, Map.of("next", next.key())));
        } else {
            cases.patchCase(caseId, Map.of("status", "with_authoriser"));
        }
    }

    public void cancel(String caseId) {
        cancelled.put(caseId, true);
    }

}
