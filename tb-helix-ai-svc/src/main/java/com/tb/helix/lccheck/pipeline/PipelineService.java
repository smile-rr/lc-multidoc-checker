package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.error.ConflictException;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.infra.stream.EventBus;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.types.StageId;
import com.tb.helix.lccheck.types.pipeline.StageOutcome;

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
public class PipelineService {

    private static final Logger log = LoggerFactory.getLogger(PipelineService.class);

    private final Map<StageId, Stage> stages = new LinkedHashMap<>();
    private final CaseStore cases;
    private final EventBus events;
    private final Map<String, Boolean> cancelled = new ConcurrentHashMap<>();

    public PipelineService(List<Stage> discovered, CaseStore cases, EventBus events) {
        discovered.forEach(s -> stages.put(s.id(), s));
        this.cases = cases;
        this.events = events;
        log.info("Pipeline stages: {}", StageId.ORDER.stream()
                .filter(stages::containsKey).map(StageId::key).toList());
    }

    /**
     * Runs a stage the officer asked for.
     *
     * <p>Asking for {@link StageId#PLAN} runs the gate first. The gate is a stage in the
     * code and a step on the wire, but not a button: "check whether the credit has expired,
     * but do not plan anything" is not a thing anyone wants.
     */
    public void runStage(String caseId, StageId requested, String officerId) {
        Map<String, Object> row = cases.find(caseId)
                .orElseThrow(() -> new NotFoundException("case", caseId));

        String expected = (String) row.get("next_stage");
        if (expected != null && !expected.equals(requested.key())) {
            throw new ConflictException(
                    "This case is waiting at " + expected + ", not " + requested.key() + ".",
                    "stage_mismatch");
        }
        if (Boolean.TRUE.equals(row.get("gate_halted")) && row.get("gate_overridden_by") == null) {
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
            Stage stage = stages.get(id);
            if (stage == null) {
                log.warn("No implementation for stage {} — skipping", id.key());
                continue;
            }
            StageOutcome outcome = runOne(caseId, stage, officerId);
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

    private StageOutcome runOne(String caseId, Stage stage, String officerId) {
        StageId id = stage.id();
        events.publish(HelixEvent.of(caseId, HelixEvent.STAGE_STARTED, Map.of("stage", id.key())));
        long started = System.currentTimeMillis();

        try {
            StageOutcome outcome = stage.execute(new DbStageContext(caseId, id, officerId, cases, events, cancelled));
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
                            "gate_halt_check_id", String.valueOf(outcome.haltingCheckId()),
                            "status", "discrepancies"));
                    events.publish(HelixEvent.of(caseId, HelixEvent.GATE_HALTED, Map.of(
                            "checkId", String.valueOf(outcome.haltingCheckId()),
                            "statement", String.valueOf(outcome.detail()))));
                    log.info("Case {} halted at {} by {}", caseId, id.key(), outcome.haltingCheckId());
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
            return StageOutcome.failed(e.getMessage());
        }
    }

    public void cancel(String caseId) {
        cancelled.put(caseId, true);
    }

    public Optional<Stage> stage(StageId id) {
        return Optional.ofNullable(stages.get(id));
    }
}
