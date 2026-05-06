package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.ArticleRef;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.config.LlmBudgetProperties;
import com.lc.v2.checker.infra.observability.TraceNames;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import com.lc.v2.checker.pipeline.StageContext;
import com.lc.v2.checker.stage.examine.tools.ExamineToolRegistry;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.model.tool.ToolExecutionResult;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Tier-aware executor for non-PROGRAMMATIC rules.
 *
 * <table>
 *   <tr><th>checkType</th><th>Path</th></tr>
 *   <tr><td>AGENT</td>      <td>{@link #callPlain} — single ChatClient call, no tools</td></tr>
 *   <tr><td>AGENT_TOOL</td> <td>{@link #callWithTools}, hard cap 3 LLM calls (one batched tool round + a retry/terminal buffer)</td></tr>
 *   <tr><td>AGENTIC</td>    <td>{@link #callWithTools}, hard cap = effectiveCap</td></tr>
 * </table>
 *
 * <h3>Hard budget — fail-stop</h3>
 * Spring AI 1.1's {@code internalToolExecutionEnabled} loop has no built-in
 * iteration cap. We disable it and drive the loop manually with a strict
 * counter so a runaway model cannot burn money. {@code effectiveCap} =
 * {@code Rule.maxIterations} when set; otherwise {@code app.llm.max-iterations}
 * (default 3). One iteration = one chat completion (= ≤ 1 round of tool calls).
 *
 * <h3>Span nesting</h3>
 * Every rule invocation runs inside a {@link Observation} scope so Spring AI's
 * {@code gen_ai.client.operation} child observations attach as spans under
 * {@code rule.<id>} (which itself nests under the {@code examine} stage span).
 * Tags are still set via {@link Tracer#currentSpan()} since the
 * Observation→Span bridge is active inside the scope.
 */
@Component
public class AgentRuleExecutor {

    private static final Logger log = LoggerFactory.getLogger(AgentRuleExecutor.class);

    private final ChatClient.Builder chatClientBuilder;
    private final ChatModel chatModel;
    private final ToolCallingManager toolCallingManager;
    private final ArticleRefRegistry refs;
    private final ResourceLoader resourceLoader;
    private final ExamineToolRegistry toolRegistry;
    /** All tools — exposed to AGENTIC rules. */
    private final List<ToolCallback> toolCallbacksAll;
    /** Compute-only tools (no data-fetch) — exposed to AGENT_TOOL rules so the
     *  2-turn budget is not burned on field lookups already inlined in the prompt. */
    private final List<ToolCallback> toolCallbacksCompute;
    private final ObservationRegistry observationRegistry;
    private final Tracer tracer;
    private final LlmBudgetProperties budget;
    /** Base prompt — used as-is for AGENT (no tools, single call). */
    private final String systemPrompt;
    /** Base + AGENT_TOOL addendum (single-round compute tools). */
    private final String systemPromptTools;
    /** Base + AGENTIC addendum (multi-turn iteration budget). */
    private final String systemPromptAgentic;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Names of tools considered "compute" (math/derivation, not data fetch).
     *  Anything outside this set is a data-fetch tool — fields are already
     *  inlined in the prompt for AGENT_TOOL rules, so those tools are hidden. */
    private static final java.util.Set<String> COMPUTE_TOOL_NAMES =
            java.util.Set.of("calculateDateDiff", "verifyArithmetic");

    private final ConcurrentMap<String, String> rulePromptCache = new ConcurrentHashMap<>();

    public AgentRuleExecutor(ChatClient.Builder chatClientBuilder,
                              ChatModel chatModel,
                              ToolCallingManager toolCallingManager,
                              ArticleRefRegistry refs,
                              ResourceLoader resourceLoader,
                              ExamineToolRegistry toolRegistry,
                              ObservationRegistry observationRegistry,
                              Tracer tracer,
                              LlmBudgetProperties budget) throws IOException {
        this.chatClientBuilder = chatClientBuilder;
        this.chatModel = chatModel;
        this.toolCallingManager = toolCallingManager;
        this.refs = refs;
        this.resourceLoader = resourceLoader;
        this.toolRegistry = toolRegistry;
        ToolCallback[] all = MethodToolCallbackProvider.builder()
                .toolObjects(toolRegistry).build().getToolCallbacks();
        this.toolCallbacksAll = List.of(all);
        List<ToolCallback> compute = new ArrayList<>();
        for (ToolCallback cb : all) {
            if (COMPUTE_TOOL_NAMES.contains(cb.getToolDefinition().name())) compute.add(cb);
        }
        this.toolCallbacksCompute = List.copyOf(compute);
        this.observationRegistry = observationRegistry;
        this.tracer = tracer;
        this.budget = budget;
        this.systemPrompt = readResource(budget.getCheckSystemPrompt());
        String toolsAdd = readResourceOrEmpty(budget.getCheckSystemPromptTools());
        String agenticAdd = readResourceOrEmpty(budget.getCheckSystemPromptAgentic());
        this.systemPromptTools = toolsAdd.isEmpty() ? systemPrompt : systemPrompt + "\n" + toolsAdd;
        this.systemPromptAgentic = agenticAdd.isEmpty() ? systemPrompt : systemPrompt + "\n" + agenticAdd;
        log.info("Loaded rule-check system prompts: base={} chars, +tools={} chars, +agentic={} chars",
                systemPrompt.length(), systemPromptTools.length(), systemPromptAgentic.length());
    }

    private String readResource(String location) throws IOException {
        try (InputStream in = resourceLoader.getResource(location).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private String readResourceOrEmpty(String location) {
        if (location == null || location.isBlank()) return "";
        Resource r = resourceLoader.getResource(location);
        if (!r.exists()) {
            log.warn("System prompt addendum {} not found — skipping", location);
            return "";
        }
        try (InputStream in = r.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("Failed to read system prompt addendum {}: {}", location, e.getMessage());
            return "";
        }
    }

    private String systemPromptFor(Rule rule) {
        return switch (rule.checkType()) {
            case "AGENT_TOOL" -> systemPromptTools;
            case "AGENTIC"    -> systemPromptAgentic;
            default           -> systemPrompt;
        };
    }

    public CheckResult execute(Rule rule, StageContext ctx) {
        // Observation-based parent scope — Spring AI emits gen_ai.client.operation
        // observations that nest under this one in Langfuse. tracer.currentSpan()
        // inside the scope returns the bridged span for tag-based metadata.
        Observation obs = Observation.createNotStarted("rule." + rule.ruleId(), observationRegistry)
                .lowCardinalityKeyValue("rule_id", rule.ruleId())
                .lowCardinalityKeyValue("rule_check_type",
                        rule.checkType() == null ? "" : rule.checkType())
                .start();
        try (Observation.Scope scope = obs.openScope()) {
            tagSpan(rule, ctx);
            int cap = effectiveCap(rule);
            return switch (rule.checkType()) {
                case "AGENT" -> callPlain(rule, ctx);
                // AGENT_TOOL: compute-only tools, hard cap 3 turns (1 tool round + retry/terminal buffer). Data-fetch tools
                // are intentionally hidden — fields are already inlined in the prompt.
                case "AGENT_TOOL" -> callWithTools(rule, ctx, Math.min(cap, 3), toolCallbacksCompute);
                // AGENTIC: full tool set, per-rule cap. Data-fetch tools are exposed
                // because rules at this tier (e.g. COND-03) may need to discover
                // which docs are present before deciding what to look at.
                case "AGENTIC" -> callWithTools(rule, ctx, cap, toolCallbacksAll);
                default -> {
                    log.warn("[{}] AgentRuleExecutor invoked for unsupported checkType={} rule={}",
                            ctx.sessionId, rule.checkType(), rule.ruleId());
                    yield callPlain(rule, ctx);
                }
            };
        } catch (Throwable t) {
            obs.error(t);
            throw t;
        } finally {
            obs.stop();
        }
    }

    /**
     * Resolve the effective per-rule cap: {@code Rule.maxIterations} wins if
     * set, otherwise the project-level {@code app.llm.max-iterations}.
     */
    private int effectiveCap(Rule rule) {
        Integer ruleCap = rule.maxIterations();
        int cap = (ruleCap != null && ruleCap > 0) ? ruleCap : budget.getMaxIterations();
        return Math.max(1, cap);
    }

    private void tagSpan(Rule rule, StageContext ctx) {
        Span s = tracer.currentSpan();
        if (s == null) return;
        s.tag("gen_ai.system", "qwen-bailian");
        s.tag("gen_ai.operation.name", "chat");
        s.tag("rule_id", rule.ruleId());
        s.tag("rule_check_type", rule.checkType() == null ? "" : rule.checkType());
        if (rule.name() != null) s.tag("rule_name", rule.name());
        if (ctx != null && ctx.sessionId != null) {
            s.tag("session.id", ctx.sessionId);
            s.tag("langfuse.session.id", ctx.sessionId);
            s.tag("langfuse.trace.name", TraceNames.forSession(ctx.sessionId));
        }
    }

    private CheckResult callPlain(Rule rule, StageContext ctx) {
        String userPrompt = buildPrompt(rule, ctx, false, 1);
        tagInput(userPrompt);
        try {
            String response = chatClientBuilder.build().prompt()
                    .options(OpenAiChatOptions.builder().build())
                    .system(systemPromptFor(rule))
                    .user(userPrompt)
                    .call()
                    .content();
            tagOutput(response);
            return parseResponse(rule.ruleId(), rule.checkType(), response, null);
        } catch (Exception e) {
            log.error("[{}] LLM call failed rule={}: {}", ctx.sessionId, rule.ruleId(), e.getMessage());
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.FAILED,
                    "LLM error: " + e.getClass().getSimpleName() + ": " + e.getMessage(),
                    null, 0.0, rule.checkType());
        }
    }

    /**
     * Manual agentic loop with a hard iteration cap.
     *
     * <p>{@code internalToolExecutionEnabled=false} forces {@link ChatModel} to
     * return after one completion when tool calls are pending; we then invoke
     * {@link ToolCallingManager#executeToolCalls} ourselves and feed the
     * extended conversation history back. The counter increments per chat
     * completion; once it reaches {@code maxIterations}, no further chat call
     * is issued and the rule surfaces NEEDS_REVIEW with the captured trace.
     */
    private CheckResult callWithTools(Rule rule, StageContext ctx, int maxIterations,
                                       List<ToolCallback> tools) {
        String userPrompt = buildPrompt(rule, ctx, true, maxIterations);
        userPrompt = "Session ID for tool calls: " + ctx.sessionId + "\n\n" + userPrompt;
        tagInput(userPrompt);

        // Per-rule thinking override: when rule.thinkingEnabled() is TRUE we
        // promote enable_thinking to true at top level of the request body.
        // Spring AI 1.1 maps OpenAiChatOptions.extraBody onto the JSON top
        // level for OpenAI-compatible providers (same plumbing as the YAML
        // additional-model-request-fields setting). Null/false → leave the
        // global enable_thinking:false default in place.
        OpenAiChatOptions.Builder optBuilder = OpenAiChatOptions.builder()
                .toolCallbacks(tools)
                .internalToolExecutionEnabled(false);
        if (Boolean.TRUE.equals(rule.thinkingEnabled())) {
            optBuilder.extraBody(java.util.Map.of("enable_thinking", true));
        }
        OpenAiChatOptions options = optBuilder.build();

        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(systemPromptFor(rule)));
        messages.add(new UserMessage(userPrompt));

        List<Map<String, Object>> toolCalls = toolRegistry.beginCapture();
        try {
            int iterations = 0;
            String lastAssistantText = null;
            while (iterations < maxIterations) {
                iterations++;
                Prompt prompt = new Prompt(messages, options);
                ChatResponse response = chatModel.call(prompt);
                AssistantMessage assistant = response.getResult().getOutput();
                lastAssistantText = assistant.getText();

                boolean wantsTools = assistant.hasToolCalls();
                if (!wantsTools) {
                    tagOutput(lastAssistantText);
                    return parseResponse(rule.ruleId(), rule.checkType(),
                            lastAssistantText, new ArrayList<>(toolCalls));
                }

                if (iterations >= maxIterations) {
                    // Budget exhausted before model produced terminal output.
                    String msg = "max_iterations (" + maxIterations + ") reached without"
                            + " terminal verdict; tool_rounds=" + toolCalls.size();
                    log.warn("[{}] rule={} {}", ctx.sessionId, rule.ruleId(), msg);
                    tagOutput("[BUDGET_EXHAUSTED] " + msg);
                    return new CheckResult(rule.ruleId(), CheckResult.Verdict.NEEDS_REVIEW,
                            msg, null, 0.0, rule.checkType(),
                            new ArrayList<>(toolCalls), null);
                }

                ToolExecutionResult toolResult = toolCallingManager.executeToolCalls(prompt, response);
                messages = new ArrayList<>(toolResult.conversationHistory());
            }
            // Defensive — loop should have returned already.
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.NEEDS_REVIEW,
                    "loop exited unexpectedly at iter=" + iterations,
                    null, 0.0, rule.checkType(), new ArrayList<>(toolCalls), null);
        } catch (Exception e) {
            log.error("[{}] Agentic LLM call failed rule={}: {}",
                    ctx.sessionId, rule.ruleId(), e.getMessage());
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.FAILED,
                    "LLM error: " + e.getClass().getSimpleName() + ": " + e.getMessage(),
                    null, 0.0, rule.checkType(),
                    new ArrayList<>(toolCalls), null);
        } finally {
            toolRegistry.endCapture();
        }
    }

    private String userPromptFor(Rule rule) {
        return rulePromptCache.computeIfAbsent(rule.ruleId(), id -> {
            try {
                Resource r = resourceLoader.getResource("classpath:/prompts/check/" + id + ".st");
                if (r.exists()) {
                    try (InputStream in = r.getInputStream()) {
                        return new String(in.readAllBytes(), StandardCharsets.UTF_8);
                    }
                }
            } catch (IOException e) {
                log.warn("Failed to load prompt for rule {}: {}", id, e.getMessage());
            }
            return rule.promptInstruction() != null ? rule.promptInstruction() : "";
        });
    }

    private String buildPrompt(Rule rule, StageContext ctx, boolean toolHint, int maxIterations) {
        StringBuilder sb = new StringBuilder();
        sb.append("Rule: ").append(rule.ruleId());
        if (rule.name() != null) sb.append(" — ").append(rule.name());
        sb.append("\n\n");

        boolean anyRef = !rule.ucpRefs().isEmpty() || !rule.isbpRefs().isEmpty();
        if (anyRef) {
            sb.append("Rule context — UCP/ISBP basis:\n");
            for (String id : rule.ucpRefs()) {
                refs.byId(id).ifPresent(a -> sb.append("  ").append(a.id())
                        .append(": ").append(safeText(a)).append("\n"));
            }
            for (String id : rule.isbpRefs()) {
                refs.byId(id).ifPresent(a -> sb.append("  ").append(a.id())
                        .append(": ").append(safeText(a)).append("\n"));
            }
            sb.append("\n");
        }

        if (rule.ucpExcerpt() != null && !rule.ucpExcerpt().isBlank()) {
            sb.append("Rule excerpt:\n").append(rule.ucpExcerpt().trim()).append("\n\n");
        }

        sb.append("LC fields:\n");
        for (String key : rule.fieldKeys()) {
            if (ctx.lc != null && ctx.lc.envelope().has(key)) {
                sb.append("  ").append(key).append(": ").append(ctx.lc.envelope().get(key)).append("\n");
            }
        }

        if (ctx.extracts != null && !ctx.extracts.isEmpty()) {
            sb.append("\nDocument fields:\n");
            ctx.extracts.forEach((dt, extract) -> {
                StringJoiner fields = new StringJoiner(", ");
                for (String key : rule.fieldKeys()) {
                    Object val = extract.consensus().get(key);
                    if (val != null) fields.add(key + "=" + val);
                }
                if (fields.length() > 0) {
                    sb.append("  ").append(dt.name()).append(": ").append(fields).append("\n");
                }
            });
        }

        sb.append("\nCompliance check instruction:\n").append(userPromptFor(rule));

        if (toolHint) {
            boolean agentic = "AGENTIC".equals(rule.checkType());
            sb.append("\n\n");
            if (agentic) {
                // AGENTIC: full read-only tool set; iteration policy lives in the
                // system prompt (prompts/system/check-system.st). Inject only the
                // per-rule turn budget; the system prompt explains how to spend it.
                sb.append("Tools available: getLcField, getDocField, getDocInventory, ")
                  .append("calculateDateDiff, listPresentedDocs. ")
                  .append("Turn budget for this rule: ").append(maxIterations).append(". ");
            } else {
                // AGENT_TOOL: compute-only tools. Iteration policy lives in the
                // system prompt; user prompt only names the available tools and budget.
                sb.append("Tools available: calculateDateDiff(fromIso, toIso) for exact day counts; ")
                  .append("verifyArithmetic(quantity, unit_price, total_amount, epsilon) for ")
                  .append("invoice header arithmetic. Turn budget for this rule: ")
                  .append(maxIterations).append(". ");
            }
            sb.append("When ready, reply with terminal JSON: "
                    + "{\"verdict\":\"PASS|FAIL|NOT_APPLICABLE|DOUBTS\","
                    + "\"confidence\":0.0-1.0,\"explanation\":\"…\","
                    + "\"condition_results\":[{\"condition_id\":\"…\","
                    + "\"condition_text\":\"…\",\"verdict\":\"…\","
                    + "\"confidence\":0.0-1.0,\"explanation\":\"…\"}]}. "
                    + "The condition_results array is required only for COND-style rules; "
                    + "omit it otherwise.");
        }
        return sb.toString();
    }

    private static final int TRACE_VALUE_MAX = 8000;

    private static String trimForTrace(String s) {
        if (s == null) return "";
        return s.length() <= TRACE_VALUE_MAX ? s : s.substring(0, TRACE_VALUE_MAX) + "…";
    }

    private void tagInput(String prompt) {
        Span s = tracer.currentSpan();
        if (s == null || prompt == null) return;
        s.tag("input.value", trimForTrace(prompt));
        s.tag("gen_ai.prompt", trimForTrace(prompt));
    }

    private void tagOutput(String response) {
        Span s = tracer.currentSpan();
        if (s == null || response == null) return;
        s.tag("output.value", trimForTrace(response));
        s.tag("gen_ai.completion", trimForTrace(response));
    }

    private static String safeText(ArticleRef a) {
        String t = a.text();
        return t == null ? "" : t.replaceAll("\\s+", " ").trim();
    }

    private CheckResult parseResponse(String ruleId, String checkType, String response,
                                       List<Map<String, Object>> toolCalls) {
        try {
            String cleaned = response == null ? "" : response.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\n?", "").replaceAll("\\n?```$", "").trim();
            }
            JsonNode node = objectMapper.readTree(cleaned);
            String verdictStr = node.path("verdict").asText("DOUBTS").toUpperCase().trim();
            String explanation = node.path("explanation").asText(null);
            double confidence = node.path("confidence").asDouble(0.85);

            CheckResult.Verdict verdict;
            try {
                verdict = CheckResult.Verdict.valueOf(verdictStr);
            } catch (IllegalArgumentException e) {
                log.warn("Unknown verdict '{}' for rule {}, defaulting to DOUBTS", verdictStr, ruleId);
                verdict = CheckResult.Verdict.DOUBTS;
            }

            List<Map<String, Object>> conditionResults = null;
            JsonNode crNode = node.path("condition_results");
            if (crNode.isArray() && crNode.size() > 0) {
                conditionResults = objectMapper.convertValue(crNode,
                        new TypeReference<List<Map<String, Object>>>() {});
            }
            return new CheckResult(ruleId, verdict, explanation, null, confidence, checkType,
                    toolCalls, conditionResults);
        } catch (Exception e) {
            log.error("Failed to parse LLM response for rule {}: {} | raw={}",
                    ruleId, e.getMessage(), response);
            return new CheckResult(ruleId, CheckResult.Verdict.FAILED,
                    "Response parse error: " + e.getMessage(), null, 0.0, checkType,
                    toolCalls, null);
        }
    }
}
