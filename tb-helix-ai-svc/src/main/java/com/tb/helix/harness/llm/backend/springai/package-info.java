/**
 * Spring AI, as one {@link com.tb.helix.harness.llm.backend.ModelBackend} and nothing more.
 *
 * <p><b>This is the only package in the service that may import {@code org.springframework.ai}
 * — and the build enforces it</b> (see {@code ArchitectureTest}). Everything above still
 * speaks {@link com.tb.helix.harness.llm.LlmGateway}: a role in, an answer out. Nothing in
 * {@code lccheck} or {@code governance} knows a framework was added, and removing this package
 * again is a directory and a line of YAML.
 *
 * <h2>Why a framework is here at all, having been argued out once</h2>
 *
 * <p>The original argument still holds and is not being reversed: one {@code /chat/completions}
 * adapter serves every OpenAI-shaped provider, and
 * {@link com.tb.helix.harness.llm.backend.chatcompletions.ChatCompletionsBackend} keeps doing exactly
 * that. What it cannot do is reach a provider that is not OpenAI-shaped. Anthropic, Bedrock and
 * Vertex each have their own request shape and their own spelling for the numbers that matter —
 * cached input, written cache, reasoning output — and writing one wire adapter per vendor means
 * tracking each vendor's JSON field names for ever. That is the wheel worth not rebuilding.
 *
 * <p><b>The predecessor's mistake is not being repeated, because the seam moved.</b> v2 used a
 * framework as its gateway and then had to bypass the framework's tool execution to get a turn
 * budget it could enforce. Here the framework sits <em>below</em> {@code ModelBackend}: it puts
 * one exchange and returns one completion. The spend ledger, the vision consensus, the tool
 * loop and its hard budget, and the JSON salvage all stay in
 * {@link com.tb.helix.harness.llm.StandardLlmGateway}, where a backend cannot forget them
 * because a backend is never asked.
 *
 * <p>Concretely, {@code internalToolExecutionEnabled(false)} is set on every options object
 * built here, and it is not a preference. Left at its default, Spring AI runs the tool loop
 * itself: unbounded, unledgered, and invisible to {@code ToolRequest.maxIterations}. That is
 * precisely the unbounded agent loop against a paid API that the gateway exists to prevent.
 *
 * <h2>Two things this backend deliberately refuses</h2>
 *
 * <ul>
 *   <li><b>Images.</b> {@link org.springframework.ai.chat.messages.UserMessage} models a turn as
 *       <em>text plus a media list</em> — {@code getText()} and {@code getMedia()} — so the
 *       order the two are placed in the wire request is Spring AI's to decide and cannot be
 *       expressed through this API at all. A document read sends byte-identical images before
 *       its instruction so that three passes ride one provider prefix cache, and the images are
 *       about 95% of the input; getting that order wrong roughly triples the interpret bill and
 *       raises nothing anywhere. So {@link SpringAiBackend} throws on an image rather than
 *       guessing, and vision roles stay on the {@code /chat/completions} backend, which
 *       controls the order explicitly. Should a later version let a caller state the order,
 *       this restriction is one method.
 *   <li><b>Streaming.</b> Nothing here consumes tokens as they arrive; a completion is parsed
 *       whole. {@code stream()} would add a second code path with its own failure modes for no
 *       reader.
 * </ul>
 *
 * <h2>Version, and why 1.1.x</h2>
 *
 * <p>Spring AI 2.0 requires Spring Boot 4.0/4.1, Spring Framework 7 and Jakarta EE 11. This
 * service is on Boot 3.5, so 1.1.x is the line that runs. The upgrade surface is deliberately
 * one method: 2.0 removed {@code internalToolExecutionEnabled} because it dropped the built-in
 * tool loop from every {@code ChatModel} — which is to say 2.0 moved towards what this package
 * already does, and migrating means deleting that call from {@link SpringAiOptions} rather than
 * rewriting anything.
 *
 * <p>Only the core model modules are on the classpath: no {@code spring-ai-starter-*}, whose
 * autoconfiguration would build {@code ChatModel} beans from {@code spring.ai.*} properties and
 * put a second configuration surface beside {@code helix.models.*} for the same question; and
 * no vector store, which is where both of the 2026 Spring AI CVEs live and which nothing here
 * needs.
 */
package com.tb.helix.harness.llm.backend.springai;
