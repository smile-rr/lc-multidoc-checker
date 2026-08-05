package com.tb.helix.harness.llm;

import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.harness.llm.text.TextResult;
import com.tb.helix.harness.llm.tool.ToolRequest;
import com.tb.helix.harness.llm.tool.ToolResult;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.harness.llm.vision.VisionResult;
import com.tb.helix.infra.error.LlmException;

/**
 * Every call to a language model in this service goes through here.
 *
 * <p>Three shapes of call, because there are three genuinely different things asked of a
 * model — not because three providers were involved:
 *
 * <ul>
 *   <li>{@link #complete} — one question, one answer.
 *   <li>{@link #read} — pages plus a prompt, answered as structured fields. Separate from
 *       {@code complete} because a run may send the same pages to several models and
 *       reconcile the answers, which is a property of reading documents and of nothing else.
 *   <li>{@link #loop} — a bounded tool-calling conversation, for rules that must compute
 *       a date difference or check arithmetic before they can conclude.
 * </ul>
 *
 * <p><b>Why this is not a framework's client.</b> The predecessor used one framework for
 * text and a raw HTTP client for vision, then bypassed the framework's tool execution to
 * get a turn budget it could enforce — two HTTP stacks, two retry policies, two places
 * to configure a timeout, for one job. Underneath, every provider worth using speaks the
 * same {@code /chat/completions} wire format. One adapter over that format serves all of
 * them, and swapping provider becomes a base URL and a key.
 *
 * <p>Provider quirks travel as {@code extraBody} on the slot's configuration rather than
 * as fields on these types. {@code enable_thinking: false} is a fact about one model
 * family; teaching this interface about it would make every future model family a change
 * to the interface.
 *
 * <p>Implementations are responsible for retries, timeouts and token accounting. They are
 * <em>not</em> responsible for caching: that is decided a layer up, where the caller knows
 * whether the question is one worth remembering.
 */
public interface LlmGateway {

    /**
     * One completion.
     *
     * @throws com.tb.helix.infra.error.LlmException when every attempt on every slot for
     *         the role failed. A caller that can proceed without an answer should catch it;
     *         most cannot, and a rule that silently concludes "pass" because the model was
     *         unreachable is the worst failure this system can have.
     */
    TextResult complete(TextRequest request);

    /**
     * Reads document pages.
     *
     * <p>When the role maps to several slots they run in parallel and their answers are
     * reconciled field by field. A slot that fails is dropped rather than failing the
     * read — redundancy is the point of having more than one.
     */
    VisionResult read(VisionRequest request);

    /**
     * A tool-calling conversation, hard-capped.
     *
     * <p>The cap is not advisory. One iteration is one completion; when the budget is
     * exhausted the result says so and carries the tool calls made so far, rather than
     * continuing or inventing a conclusion. An unbounded agent loop against a paid API
     * is an unbounded bill.
     *
     * <p>Every tool a model asks for in one turn is run, and all of the results are handed
     * back in the <em>next</em> completion — one iteration, however many tools. Running
     * them a round trip apart would spend the budget on transport instead of on thinking.
     */
    ToolResult loop(ToolRequest request);

    /**
     * Who would answer this role right now, as one stable string.
     *
     * <p><b>For the derivation cache, and it exists because the cache was lying.</b> Callers
     * build a {@link com.tb.helix.infra.cache.DerivationKey} <em>before</em> any request is
     * assembled — that is the whole point, so a hit costs neither the render nor the call —
     * and at that moment the caller knows its prompt and its input but not which model the
     * role resolves to. Every call site therefore wrote the role's own name into the key's
     * {@code modelId}, and the key's promise that "the same model name at two providers is
     * two models" was not kept by anything: changing {@code helix.models.vlm-1.model} in
     * {@code .env}, or pointing a slot at another provider, left every stored answer looking
     * valid and every subsequent run served conclusions the new model never reached.
     *
     * <p>So the gateway answers it, because the gateway is what resolves it. Cheap — a map
     * lookup over configuration, no I/O — which is what lets it sit in front of the cache
     * rather than behind it.
     *
     * <p>It names the <b>backend</b> as well as the model and the endpoint. A role moved from
     * one backend to another is the same model at the same provider reached through different
     * code that assembles the request differently, and answers computed by the old assembly
     * must not be served for the new one. Consensus slots all appear, in configured order:
     * dropping a slot changes what a read is worth and must change the key.
     *
     * @return e.g. {@code chat-completions/qwen3-vl-plus@dashscope.aliyuncs.com}, and for an
     *         unconfigured role {@code unresolved/<role>} — which keys consistently, so a run
     *         with no model configured cannot poison entries a working one wrote
     */
    String identity(LlmRole role);
}
