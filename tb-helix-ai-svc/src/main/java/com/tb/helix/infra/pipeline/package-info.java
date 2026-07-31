/**
 * Running declared steps, without knowing what they are.
 *
 * <p>A step has a key, a label, a predicate saying whether it applies, and a body.
 * {@link com.tb.helix.infra.pipeline.PipelineEngine} walks a phase's steps and reports each
 * one through {@link com.tb.helix.infra.pipeline.StepJournal}. That is the whole thing.
 *
 * <p>It lives in {@code infra} because it is genuinely domain-neutral, and because putting it
 * here <em>proves</em> that rather than asserting it: {@code infra} may not reach any layer
 * above it, so the build fails the day this learns what a letter of credit is. The parts that
 * are not neutral — which stage follows which, that a gate rides with the plan, that a halt
 * means a discrepancy and not a fault, that a person must ask before the next phase runs —
 * stay in {@code lccheck.pipeline}, where they belong.
 *
 * <p>Flat, one package, no sub-packages. That is the convention for {@code infra}: five small
 * classes that are read together and mean nothing apart.
 */
package com.tb.helix.infra.pipeline;
