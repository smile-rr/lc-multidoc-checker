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
import com.tb.helix.lccheck.types.CaseStatus;
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
 * Whether a stage may run now, and what it means when it ends.
 *
 * <p>Named for what it does rather than for running, because running is the middle third of
 * it and the least interesting: {@link com.tb.helix.infra.pipeline.PipelineEngine} does that.
 * This <b>gatekeeps</b> — is it the officer's turn, is the case halted — then launches, then
 * <b>settles</b>: a halt becomes a discrepancy on the case, a failure becomes an error, and a
 * clean finish parks the case at the next stage a person can ask for.
 *
 * <p>The predecessor called this a runner, which over-promised: it never runs an examination,
 * it runs one stage of one. {@code JobLauncher} is the same idea in Spring Batch, next to a
 * {@code Job} that is the definition — here, {@link DocCheckPipeline}.
 *
 * <p>Only intake runs by itself. Every later stage waits at {@code awaiting_officer} until
 * a person asks for it — this is a regulated examination, and a pipeline that ran to
 * completion on upload would be presenting conclusions nobody chose to reach.
 *
 * <p><b>Why this is not in infra.</b> The shape is generic and the content is not. Every line
 * that is left is UCP 600 or the bank's: that a halted case needs an override before anything
 * else runs, that a halt is a discrepancy rather than a fault, that a finished stage parks at
 * the next one an officer may request, that asking is an audited act. A generic runner would
 * need a port for each of those, each with exactly one implementation, and {@code infra} would
 * end up containing the idea of an officer overriding a rule.
 *
 * <p>Stages hold no state between calls. Everything a stage needs it reads from the
 * database and the blob store through its context, so any instance can resume any case
 * after a restart. The only in-memory state here is a cancellation flag, and losing it
 * costs a run that keeps going rather than a case that cannot continue.
 */
@Service
public class StageLauncher {

    private static final Logger log = LoggerFactory.getLogger(StageLauncher.class);

    private final DocCheckPipeline pipeline;
    private final CaseStore cases;
    private final EventBus events;
    private final Map<String, Boolean> cancelled = new ConcurrentHashMap<>();

    public StageLauncher(DocCheckPipeline pipeline, CaseStore cases, EventBus events) {
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
                    phase -> new StageContext(caseId, ((Stage) phase).id(), officerId, cases, events, cancelled));
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
            default -> awaitOfficer(caseId, last, outcome.result());
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
                "status", CaseStatus.DISCREPANCIES.key()));
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
    private void awaitOfficer(String caseId, StageId last, StepResult result) {
        cases.patchCase(caseId, Map.of("status", statusAfter(last, result).key()));

        StageId next = pipeline.nextOfficerStageAfter(last).orElse(null);
        cases.setStage(caseId, last, next, next != null);
        if (next != null) {
            events.publish(HelixEvent.of(caseId, HelixEvent.AWAITING_OFFICER, Map.of("next", next.key())));
        }
    }

    /**
     * What a case's status becomes when a stage ends well.
     *
     * <p>The whole rule, in one place. It used to be four stages each patching the column on
     * their way out, so what a case's status <em>was</em> depended on which stage happened to
     * finish last, and two of them could write the same value for different reasons. Nothing
     * checked, because nothing could: there was no one place to check in.
     *
     * <p>A function rather than a transition table, because a status is not independent
     * state. Nothing moves a case from {@code DISCREPANCIES} to {@code CLEAN}; a stage ends
     * and the status follows from what it found. That is also why this is not a state machine
     * library — there are no transitions to declare, only an answer to compute.
     */
    private CaseStatus statusAfter(StageId stage, StepResult result) {
        return switch (stage) {
            case INTAKE -> CaseStatus.AWAITING_CHECK;
            case INTERPRET, GATE, PLAN -> CaseStatus.TO_DECIDE;
            case EXECUTE -> count(result, "findings") > 0 ? CaseStatus.DISCREPANCIES : CaseStatus.CLEAN;
            // Only findings the officer agreed to become grounds; none means nothing was
            // raised, which is a clean presentation rather than one sent on.
            case SIGNOFF -> count(result, "grounds") > 0 ? CaseStatus.WITH_AUTHORISER : CaseStatus.CLEAN;
        };
    }

    private long count(StepResult result, String key) {
        return result.data().get(key) instanceof Number n ? n.longValue() : 0;
    }

    public void cancel(String caseId) {
        cancelled.put(caseId, true);
    }

}
