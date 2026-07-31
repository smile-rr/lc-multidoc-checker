package com.tb.helix.infra.pipeline;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * An ordered set of phases, and the questions you can ask about their order.
 *
 * <p>A definition, not an execution: nothing here runs anything, holds per-run state or does
 * I/O, so it is safe to ask at any time — including from a controller serving the pipeline
 * over HTTP. {@link PipelineEngine} is what runs it.
 *
 * <p>The sequencing is here rather than restated by each product because it is the same
 * sequencing every time: what comes after this, what may be asked for next, what has to run
 * alongside the thing being asked for. A subclass supplies the phases and adds whatever its
 * own domain means by them.
 *
 * @param <C> the context the phases run against
 */
public class Pipeline<C extends StepJournal> {

    private final List<StepPhase<C>> phases;

    protected Pipeline(List<StepPhase<C>> phases) {
        this.phases = List.copyOf(phases);
    }

    public List<StepPhase<C>> phases() {
        return phases;
    }

    public Optional<StepPhase<C>> phase(String key) {
        return phases.stream().filter(p -> p.key().equals(key)).findFirst();
    }

    /** Everything after this phase — what redoing it invalidates. */
    public List<StepPhase<C>> after(String key) {
        int i = indexOf(key);
        return i < 0 ? List.of() : phases.subList(i + 1, phases.size());
    }

    /**
     * The next phase a person can ask for.
     *
     * <p>Not simply the next one: parking on a {@link Trigger#WITH_NEXT} phase would leave
     * the work waiting for a request nobody can make.
     */
    public Optional<StepPhase<C>> nextRequestableAfter(String key) {
        return after(key).stream().filter(p -> p.trigger() == Trigger.ON_REQUEST).findFirst();
    }

    /**
     * What actually runs when this phase is asked for.
     *
     * <p>The requested phase, preceded by any {@link Trigger#WITH_NEXT} phases sitting
     * immediately before it. That is how a cheap precondition gets to run before an expensive
     * phase without being something anyone has to remember to ask for — and it is derived
     * from the phases themselves, so adding one is declaring a trigger rather than editing a
     * conditional in the runner.
     */
    public List<StepPhase<C>> requestedRun(String key) {
        int i = indexOf(key);
        if (i < 0) return List.of();
        int from = i;
        while (from > 0 && phases.get(from - 1).trigger() == Trigger.WITH_NEXT) from--;
        return phases.subList(from, i + 1);
    }

    /**
     * The whole pipeline, from the phases' own declarations.
     *
     * <p>Not a description of what runs — it <em>is</em> what runs, read off the same
     * {@code steps()} the engine walks.
     */
    public List<Map<String, Object>> describe() {
        return phases.stream().map(p -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("stage", p.key());
            out.put("trigger", p.trigger().name().toLowerCase());
            out.put("auto", p.trigger() == Trigger.AUTOMATIC);
            out.put("officerStarts", p.trigger() == Trigger.ON_REQUEST);
            out.put("steps", p.steps().stream()
                    .map(s -> Map.<String, Object>of("key", s.key(), "label", s.label()))
                    .toList());
            return out;
        }).toList();
    }

    private int indexOf(String key) {
        for (int i = 0; i < phases.size(); i++) {
            if (phases.get(i).key().equals(key)) return i;
        }
        return -1;
    }
}
