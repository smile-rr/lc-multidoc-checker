/**
 * How a documentary-credit examination is paced.
 *
 * <p>Four things, four different questions:
 *
 * <table>
 *   <caption>The pipeline package</caption>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.Stage}</td>
 *       <td>what one phase is made of — a declaration, not a body</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.StageContext}</td>
 *       <td>what a step may do, and where its progress is written down</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.DocCheckPipeline}</td>
 *       <td><b>what</b> this examination is — the six stages, in order. Describes; never runs.</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.ExaminationRunner}</td>
 *       <td><b>how</b> it runs here — officer pacing, the gate riding with the plan, halts,
 *           the async boundary</td></tr>
 * </table>
 *
 * <p>Named for what each does rather than distinguished by a {@code Service} suffix. "The
 * pipeline" was three things at once — a registry, a runner, and a loop inside the runner —
 * and one word for three things is how a package stops being readable.
 *
 * <h2>What is here, and what is in infra</h2>
 *
 * <p>The step machinery is not here. {@link com.tb.helix.infra.pipeline.Step},
 * {@link com.tb.helix.infra.pipeline.StepResult} and
 * {@link com.tb.helix.infra.pipeline.PipelineEngine} live in {@code infra.pipeline} because
 * they are genuinely domain-neutral — the engine walks a phase's steps and reports through a
 * journal port, and never looks inside the context. Putting them there <em>proves</em> that
 * rather than asserting it: {@code infra} may not reach any layer above it, so the build
 * fails the day the engine learns a domain word.
 *
 * <p>What stays here is everything that is not neutral, and it is most of the value:
 * that the gate rides with the plan, that a halt sets {@code gate_halted} and means a
 * discrepancy rather than a fault, that every stage after intake waits at
 * {@code awaiting_officer} until a person asks, that an override is a thing an officer can
 * do. Those are UCP 600's rules and the bank's, not a scheduler's. The split is exactly
 * there: {@code infra} runs steps, {@code lccheck} decides which steps, in what order, and
 * who is allowed to start them.
 *
 * <p>{@link com.tb.helix.lccheck.pipeline.DbStageContext} is the seam — it implements the
 * engine's journal by writing to the step tape and publishing to the browser, which is the
 * one place those two descriptions of a step are guaranteed to agree.
 */
package com.tb.helix.lccheck.pipeline;
