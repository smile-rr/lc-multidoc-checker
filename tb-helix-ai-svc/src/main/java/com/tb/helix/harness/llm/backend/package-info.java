/**
 * One round trip to a model, and nothing else.
 *
 * <p>This is the layer a new provider, framework or SDK plugs into. It is deliberately the
 * <em>narrowest</em> thing that can still be called a model call: turns in, a completion out.
 * No retries policy, no consensus, no token ledger, no cache, no tool loop — all of that lives
 * above, in {@link com.tb.helix.harness.llm.StandardLlmGateway}, and is therefore impossible
 * for a new backend to omit.
 *
 * <p><b>Why the seam is here and not at {@code LlmGateway}.</b> {@code LlmGateway} was already
 * a port, so a second implementation was always legal. It was just ruinously expensive: the one
 * implementation carried role resolution, the spend ledger, the run-log events, the vision
 * consensus, the tool-loop budget and the JSON salvage, and every one of those is
 * provider-neutral. A second implementation had to reproduce all of it, and the failure mode was
 * silent — a backend that forgot the ledger works perfectly and simply stops reporting money.
 *
 * <p>So a backend implements two methods and inherits every guarantee. Writing one is a day;
 * getting one wrong no longer costs a feature.
 *
 * <h2>What a backend must honour</h2>
 *
 * <ul>
 *   <li><b>Content order is not advisory.</b> {@link com.tb.helix.harness.llm.backend.Turn.User}
 *       carries an ordered list of parts, and a document read sends its images <em>before</em>
 *       its instruction on purpose: three passes over byte-identical pages ride one provider
 *       prefix cache, and the images are ~95% of the input. A backend that reorders parts, or
 *       that hands them to a framework which reorders them, roughly triples the bill for
 *       interpret and nothing anywhere will report an error. Verify with
 *       {@code prompt_tokens_details.cached_tokens} on the second pass, not by reading docs.
 *   <li><b>Hints that cannot be applied must be reported, not dropped.</b>
 *       {@link com.tb.helix.harness.llm.backend.Exchange#hints} carries things like
 *       {@code enable_thinking:false}, which is what stops a Qwen3-family model leaking its
 *       reasoning into structured output. A backend with nowhere to put a hint must say so at
 *       startup. Silently ignoring one degrades an extraction and looks like nothing happened.
 *   <li><b>Report the tokens it was given.</b> Including
 *       {@link com.tb.helix.harness.llm.backend.Completion#cachedPromptTokens} where the
 *       provider reports it — that figure is the only evidence the prefix ordering above is
 *       working.
 *   <li><b>Never invoke a tool.</b> {@link com.tb.helix.harness.llm.tool.ToolSpec} arrives with
 *       an executable handler attached because that is the type the rest of the system uses; a
 *       backend reads its name, description and parameters to build a schema and stops there.
 *       Execution and the hard turn budget belong to the gateway, and a framework that runs the
 *       loop itself is exactly how an unbounded agent loop gets back in.
 * </ul>
 */
package com.tb.helix.harness.llm.backend;
