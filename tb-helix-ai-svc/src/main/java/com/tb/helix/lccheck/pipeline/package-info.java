/**
 * How a document examination is paced. Five files, five jobs.
 *
 * <pre>
 *   DocCheckPipeline   WHAT the examination is — the six stages, in order, and who may
 *                      start each. Read this file and you know the flow.
 *   Stage              a phase of that examination. One method of its own: which stage.
 *   StageContext       what a step is allowed to do — record, read back, emit, cancel.
 *   DbStageContext     the only implementation: does all of that against Postgres and SSE.
 *   ExaminationRunner  HOW it runs here — the officer's turn, the gate riding with the
 *                      plan, halts, the async boundary.
 * </pre>
 *
 * <p>Named for the job, not distinguished by a {@code Service} suffix. "The pipeline" had
 * been three things at once — a registry, a runner, and a loop inside the runner — and one
 * word for three things is how a package stops being readable.
 *
 * <h2>Where the rest of it is</h2>
 *
 * <p>The machinery is not here. {@link com.tb.helix.infra.pipeline.Step},
 * {@link com.tb.helix.infra.pipeline.StepResult} and
 * {@link com.tb.helix.infra.pipeline.PipelineEngine} live in {@code infra.pipeline}: the
 * engine walks a phase's declared steps, announces each one, writes it down through a journal
 * port, and stops on a halt. It never looks inside the context. Putting it in {@code infra}
 * <em>proves</em> that rather than asserting it — {@code infra} may not reach any layer above
 * it, so the build fails the day the engine learns a domain word.
 *
 * <p>These two are not duplicates of each other. The engine knows how to run a list; this
 * package knows <b>which</b> list, <b>in what order</b>, and <b>who is allowed to start it</b>
 * — that the gate rides with the plan, that a halt means a discrepancy and not a fault, that
 * every stage after intake waits for a person. Those are UCP 600's rules and the bank's, and
 * they are most of the value.
 *
 * <p>{@link com.tb.helix.lccheck.pipeline.DbStageContext} is the seam between the two: it
 * implements the engine's journal by writing the step tape and publishing to the browser,
 * which is the one place those two accounts of a step are guaranteed to agree.
 *
 * <h2>Reading a stage</h2>
 *
 * <p>Every stage is written the same way, top down: {@code id()}, then {@code steps()}, then
 * the step bodies, then helpers. The declaration comes before the detail, so opening a stage
 * tells you what it does before it tells you how. Rules that are not orchestration —
 * turning a credit reading into columns, for one — live in their own class beside it.
 */
package com.tb.helix.lccheck.pipeline;
