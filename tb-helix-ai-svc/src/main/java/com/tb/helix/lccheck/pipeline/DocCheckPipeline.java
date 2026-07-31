package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.stage.execute.ExecuteStage;
import com.tb.helix.lccheck.stage.gate.GateStage;
import com.tb.helix.lccheck.stage.intake.IntakeStage;
import com.tb.helix.lccheck.stage.interpret.InterpretStage;
import com.tb.helix.lccheck.stage.plan.PlanStage;
import com.tb.helix.lccheck.stage.signoff.SignoffStage;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The examination: which stages, in what order, and who may start each one.
 *
 * <p>A <b>pipeline</b> is made of <b>stages</b>; a stage is made of <b>steps</b>. Those three
 * words are used for those three things everywhere — in the packages, on the wire, in the
 * database and in the browser. There is no fourth word for any of them.
 *
 * <p>The constructor is the pipeline. Six stages, named by their implementing class, in the
 * order they run — so the reader gets from "what does a document check do" to the code that
 * does it in one jump, with no registry to consult and no key to resolve. This is what the
 * predecessor's {@code LcV2Pipeline} did, and what a Spring Batch job configuration does, and
 * it is better than the version this replaces: that one listed {@code StageId} constants and
 * matched them against injected beans, which meant the class named "pipeline" told you the
 * order but not what ran.
 */
@Component
public class DocCheckPipeline {

    private final List<Stage> stages;

    public DocCheckPipeline(
            IntakeStage intake,          // automatic, on upload: store the files, read the credit
            InterpretStage interpret,    // officer: sort the pages, read each document
            GateStage gate,              // no button — runs with PLAN, so a halt costs nothing
            PlanStage plan,              // officer: select the rules, read the credit's demands
            ExecuteStage execute,        // officer: run the checks
            SignoffStage signoff) {      // officer: assemble the advice
        this.stages = List.of(intake, interpret, gate, plan, execute, signoff);
    }

    /**
     * The stages an officer can ask for by name.
     *
     * <p>Intake is absent because it runs on upload. The gate is absent because "check
     * whether the credit has expired, but do not plan anything" is not something anyone
     * wants — it runs with the plan, before the expensive half.
     */
    private static final List<StageId> OFFICER_STARTS = List.of(
            StageId.INTERPRET, StageId.PLAN, StageId.EXECUTE, StageId.SIGNOFF);

    // --- Asking about the pipeline ------------------------------------------

    public List<StageId> order() {
        return stages.stream().map(Stage::id).toList();
    }

    public Optional<Stage> stage(StageId id) {
        return stages.stream().filter(s -> s.id() == id).findFirst();
    }

    public boolean officerStarts(StageId id) {
        return OFFICER_STARTS.contains(id);
    }

    /**
     * The next stage an officer can ask for.
     *
     * <p>Not simply the next one: parking a case at "waiting for gate" would leave it
     * waiting for a button that does not exist.
     */
    public Optional<StageId> nextOfficerStageAfter(StageId id) {
        return after(id).stream().filter(OFFICER_STARTS::contains).findFirst();
    }

    /** Everything after this stage — what a rerun invalidates. */
    public List<StageId> after(StageId id) {
        List<StageId> ids = order();
        int i = ids.indexOf(id);
        return i < 0 ? List.of() : ids.subList(i + 1, ids.size());
    }

    /**
     * The whole pipeline, from the stages' own declarations.
     *
     * <p>Not a description of what runs — it <em>is</em> what runs, read off the same
     * {@code steps()} the engine walks. Each step ships its key and its label: a browser
     * rendering another language translates on the key, one drawing a progress bar uses the
     * label as it stands.
     */
    public List<Map<String, Object>> describe() {
        return stages.stream().map(s -> {
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("stage", s.id().key());
            stage.put("auto", s.id().automatic());
            stage.put("officerStarts", officerStarts(s.id()));
            stage.put("steps", s.steps().stream()
                    .map(step -> Map.<String, Object>of("key", step.key(), "label", step.label()))
                    .toList());
            return stage;
        }).toList();
    }
}
