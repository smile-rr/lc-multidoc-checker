package com.tb.helix.lccheck.pipeline;

import com.tb.helix.infra.pipeline.Pipeline;
import com.tb.helix.lccheck.stage.execute.ExecuteStage;
import com.tb.helix.lccheck.stage.gate.GateStage;
import com.tb.helix.lccheck.stage.intake.IntakeStage;
import com.tb.helix.lccheck.stage.interpret.InterpretStage;
import com.tb.helix.lccheck.stage.plan.PlanStage;
import com.tb.helix.lccheck.stage.signoff.SignoffStage;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * What a document examination is: six stages, in this order.
 *
 * <p>The constructor is the whole definition. Everything you can ask about the order —
 * what comes after, what may be requested next, what runs alongside a request — is inherited
 * from {@link Pipeline}, because that reasoning is the same for any ordered set of phases and
 * does not become different by being about letters of credit.
 *
 * <p>How each stage is started is <b>the stage's own declaration</b>, not a list here. There
 * used to be two lists of {@code StageId} — the automatic ones and the requestable ones —
 * which is a second description of a stage kept beside it by hand. Ask a stage.
 */
@Component
public class DocCheckPipeline extends Pipeline<StageContext> {

    public DocCheckPipeline(
            IntakeStage intake,          // AUTOMATIC on upload: store the files, read the credit
            InterpretStage interpret,    // officer: sort the pages, read each document
            GateStage gate,              // WITH_NEXT: runs with the plan, so a halt costs nothing
            PlanStage plan,              // officer: select the rules, read the credit's demands
            ExecuteStage execute,        // officer: run the checks
            SignoffStage signoff) {      // officer: assemble the advice
        super(List.of(intake, interpret, gate, plan, execute, signoff));
    }

    /** The same questions, in the vocabulary the rest of lc-check speaks. */
    public Optional<Stage> stage(StageId id) {
        return phase(id.key()).map(Stage.class::cast);
    }

    public List<StageId> after(StageId id) {
        return after(id.key()).stream().map(p -> ((Stage) p).id()).toList();
    }

    public Optional<StageId> nextOfficerStageAfter(StageId id) {
        return nextRequestableAfter(id.key()).map(p -> ((Stage) p).id());
    }

    /** The stages that actually run when the officer asks for this one. */
    public List<Stage> runFor(StageId id) {
        return requestedRun(id.key()).stream().map(Stage.class::cast).toList();
    }
}
