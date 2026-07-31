/**
 * How an examination is paced.
 *
 * <p>Four things, and they answer four different questions:
 *
 * <table>
 *   <caption>The pipeline package</caption>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.Stage}</td>
 *       <td>what one phase is made of — a declaration, not a body</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.Step}</td>
 *       <td>one unit of work: key, label, when it applies, what it does</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.Pipeline}</td>
 *       <td><b>what</b> the examination is — the stages in order. Describes; never runs.</td></tr>
 *   <tr><td>{@link com.tb.helix.lccheck.pipeline.PipelineService}</td>
 *       <td><b>how</b> it runs — officer pacing, async execution, halts, the step tape</td></tr>
 * </table>
 *
 * <p>{@code Pipeline} and {@code PipelineService} were one class that held a registry it also
 * executed, and then briefly two that each built their own copy of that registry — which had
 * already begun to differ, one ordered by the pipeline and one by whatever order Spring
 * handed the beans over. Splitting them on <em>what it is</em> versus <em>how it runs</em> is
 * the same split the predecessor made between {@code LcV2Pipeline} and its
 * {@code PipelineService}, and it is why a controller can safely ask for the flow: describing
 * it touches no per-case state and starts nothing.
 *
 * <h2>Why this is not infrastructure</h2>
 *
 * <p>It looks like a framework and it is not one. {@code PipelineService} knows that the gate
 * rides with the plan, that a halt sets {@code gate_halted} and means a discrepancy rather
 * than a fault, that every stage after intake waits at {@code awaiting_officer} until a person
 * asks for it, and that an override is a thing an officer can do. Those are UCP 600's rules
 * and the bank's, not a scheduler's. Moved to {@code infra} it would drag {@code StageId},
 * {@code CaseStore} and the meaning of a discrepancy into a layer whose whole definition is
 * that it knows nothing about letters of credit — and {@code ArchitectureTest} would refuse
 * it, correctly.
 *
 * <p>{@link com.tb.helix.lccheck.pipeline.Step} genuinely is domain-neutral, and could be
 * lifted into {@code harness} as a small step-running framework. It has not been, and the
 * reason is worth recording: it is one interface with one consumer, and its collaborator
 * {@code StageContext} is not neutral at all — it speaks of cases, officers and a step tape.
 * Making that generic means type parameters and an indirection for a framework nobody else
 * uses yet. When a second product wants it, the extraction is small and the seam is already
 * here.
 */
package com.tb.helix.lccheck.pipeline;
