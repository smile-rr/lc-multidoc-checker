package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The examination: which stages, in what order, and who may start each one.
 *
 * <p>This file is the flow. {@link #FLOW} below is the whole of it, and everything else here
 * is a question asked of that list. If you want to know what a document check does, read the
 * next twenty lines; if you want to know how a stage does it, open the stage.
 *
 * <p>The order used to live on {@link StageId}, which meant the enum of stage <em>names</em>
 * also owned what runs after what — so the class called "pipeline" could be read end to end
 * without learning the pipeline. Names are the enum's; sequence is this class's.
 */
@Component
public class DocCheckPipeline {

    /**
     * The document examination, in order.
     *
     * <p>Only the first runs by itself. Every later stage waits until a person asks for it —
     * this is a regulated examination, and a pipeline that ran to completion on upload would
     * be presenting conclusions nobody chose to reach.
     */
    private static final List<StageId> FLOW = List.of(
            StageId.INTAKE,      // automatic, on upload: store the files, read the credit
            StageId.INTERPRET,   // officer: sort the pages, read each document
            StageId.GATE,        // no button — rides with PLAN, so a halt costs nothing
            StageId.PLAN,        // officer: select the rules, read the credit's own demands
            StageId.EXECUTE,     // officer: run the checks
            StageId.SIGNOFF);    // officer: assemble the advice

    /**
     * The stages an officer can ask for by name.
     *
     * <p>{@link StageId#INTAKE} is absent because it runs on upload. {@link StageId#GATE} is
     * absent because "check whether the credit has expired, but do not plan anything" is not
     * something anyone wants — it runs with the plan, before the expensive half.
     */
    private static final List<StageId> OFFICER_STARTS = List.of(
            StageId.INTERPRET, StageId.PLAN, StageId.EXECUTE, StageId.SIGNOFF);

    private final Map<StageId, Stage> stages = new LinkedHashMap<>();

    public DocCheckPipeline(List<Stage> implementations) {
        // Indexed in FLOW order, not the order Spring handed the beans over — which is
        // arbitrary and can change when an unrelated class is renamed.
        for (StageId id : FLOW) {
            implementations.stream().filter(s -> s.id() == id).findFirst()
                    .ifPresent(s -> stages.put(id, s));
        }
    }

    // --- Asking about the flow ----------------------------------------------

    /** The stages that have an implementation, in flow order. */
    public List<StageId> order() {
        return List.copyOf(stages.keySet());
    }

    public Optional<Stage> stage(StageId id) {
        return Optional.ofNullable(stages.get(id));
    }

    public boolean officerStarts(StageId id) {
        return OFFICER_STARTS.contains(id);
    }

    /**
     * The next stage an officer can ask for.
     *
     * <p>Not simply the next in {@link #FLOW}: parking a case at "waiting for gate" would
     * leave it waiting for something that cannot be pressed.
     */
    public Optional<StageId> nextOfficerStageAfter(StageId id) {
        int i = FLOW.indexOf(id);
        if (i < 0) return Optional.empty();
        return FLOW.subList(i + 1, FLOW.size()).stream().filter(OFFICER_STARTS::contains).findFirst();
    }

    /** Everything after this stage — what a rerun invalidates. */
    public List<StageId> after(StageId id) {
        int i = FLOW.indexOf(id);
        return i < 0 ? List.of() : FLOW.subList(i + 1, FLOW.size());
    }

    /**
     * The whole flow, from the stages' own declarations.
     *
     * <p>Not a description of what runs — it <em>is</em> what runs, read off the same
     * {@code steps()} the engine walks. Each step ships its key and its label: a browser
     * rendering another language translates on the key, one drawing a progress bar uses the
     * label as it stands.
     */
    public List<Map<String, Object>> describe() {
        return stages.entrySet().stream().map(e -> {
            StageId id = e.getKey();
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("stage", id.key());
            stage.put("auto", id.automatic());
            stage.put("officerStarts", officerStarts(id));
            stage.put("steps", e.getValue().steps().stream()
                    .map(s -> Map.<String, Object>of("key", s.key(), "label", s.label()))
                    .toList());
            return stage;
        }).toList();
    }
}
