package com.tb.helix.lccheck.service;

import com.tb.helix.lccheck.pipeline.Stage;
import com.tb.helix.lccheck.types.StageId;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The examination, described from its own declarations.
 *
 * <p>Nothing here is written down twice. The stages come from {@link StageId#ORDER}, the
 * steps from each {@link Stage#steps()}, and the labels from the steps themselves — so this
 * cannot disagree with what actually runs, because it is what actually runs.
 *
 * <p>It exists because four separate places used to describe this pipeline: the stage enum,
 * the strings inside the stage bodies, and two constants in the browser. None was derived
 * from the others, so they drifted — the browser believed in three steps while the service
 * ran six stages — and nothing failed when they did.
 *
 * <p>Both the key and the label go out. A browser that wants to render the flow in another
 * language translates on the key and falls back to the label; one that just wants to draw a
 * progress bar uses the label as it is.
 */
@Service
public class FlowService {

    private final Map<StageId, Stage> stages = new LinkedHashMap<>();

    public FlowService(List<Stage> discovered) {
        // Ordered by the pipeline, not by whatever order Spring handed them over. A flow
        // document in bean-definition order would be arbitrary and would change silently.
        for (StageId id : StageId.ORDER) {
            discovered.stream().filter(s -> s.id() == id).findFirst()
                    .ifPresent(s -> stages.put(id, s));
        }
    }

    /** The whole flow: every stage, its steps, and who starts it. */
    public List<Map<String, Object>> describe() {
        return stages.entrySet().stream().map(e -> {
            StageId id = e.getKey();
            Map<String, Object> stage = new LinkedHashMap<>();
            stage.put("stage", id.key());
            stage.put("auto", id.automatic());
            // GATE runs, and has its own events and step rows, but no button: "check
            // whether the credit has expired, but do not plan anything" is not a thing
            // anyone wants. A browser drawing buttons needs to know that.
            stage.put("officerStarts", hasButton(id));
            stage.put("steps", e.getValue().steps().stream().map(s -> Map.of(
                    "key", s.key(), "label", s.label())).toList());
            return stage;
        }).toList();
    }

    /**
     * Whether an officer can ask for this stage by name.
     *
     * <p>Read from {@link StageId#OFFICER_TRIGGERED} rather than re-derived here. The gate
     * is absent from it because it rides with plan — and that list is already what
     * {@code PipelineService} enforces, so a second derivation could only ever disagree
     * with the thing it was describing.
     */
    private boolean hasButton(StageId id) {
        return StageId.OFFICER_TRIGGERED.contains(id);
    }
}
