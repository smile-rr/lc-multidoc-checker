package com.tb.helix.lccheck.pipeline;

import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * What the examination is: the stages, in order, and the steps each is made of.
 *
 * <p>Answers "what is this pipeline". {@link ExaminationRunner} answers "run it". They were one
 * class holding a registry it also executed, and then briefly two classes each building their
 * own copy of the same registry — which had already started to differ, one ordered and one in
 * whatever order Spring handed the beans over. This is the registry, once.
 *
 * <p>Nothing here runs anything, holds per-case state, or is asynchronous. That is what makes
 * it safe to ask at any time, including from a controller serving {@code GET /flow}.
 */
@Component
public class DocCheckPipeline {

    private final Map<StageId, Stage> stages = new LinkedHashMap<>();

    public DocCheckPipeline(List<Stage> discovered) {
        // Ordered by StageId.ORDER, not by bean-definition order. Spring's order is
        // arbitrary and can change when an unrelated class is renamed; the pipeline's is
        // the product.
        for (StageId id : StageId.ORDER) {
            discovered.stream().filter(s -> s.id() == id).findFirst()
                    .ifPresent(s -> stages.put(id, s));
        }
    }

    /** The stages that have an implementation, in pipeline order. */
    public List<StageId> order() {
        return List.copyOf(stages.keySet());
    }

    public Optional<Stage> stage(StageId id) {
        return Optional.ofNullable(stages.get(id));
    }

    /**
     * The whole flow, from the stages' own declarations.
     *
     * <p>Not a description of what runs — it <em>is</em> what runs, read off the same
     * {@link Stage#steps()} the runner walks. Four separate places used to describe this
     * pipeline (the stage enum, the strings inside the stage bodies, and two constants in the
     * browser); none was derived from the others, so they drifted and nothing failed.
     *
     * <p>Each step ships its key and its label. A browser rendering another language
     * translates on the key and falls back to the label; one just drawing a progress bar uses
     * the label as it stands.
     */
    public List<Map<String, Object>> describe() {
        return stages.entrySet().stream().map(e -> {
            StageId id = e.getKey();
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("stage", id.key());
            stage.put("auto", id.automatic());
            // The gate runs, and has its own events and step rows, but no button: "check
            // whether the credit has expired, but do not plan anything" is not a thing
            // anyone wants. A browser drawing buttons needs to know that, and reads it from
            // OFFICER_TRIGGERED rather than from a second list that could disagree.
            stage.put("officerStarts", StageId.OFFICER_TRIGGERED.contains(id));
            stage.put("steps", e.getValue().steps().stream()
                    .map(s -> Map.<String, Object>of("key", s.key(), "label", s.label()))
                    .toList());
            return stage;
        }).toList();
    }
}
