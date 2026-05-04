package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.ArticleRef;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import com.lc.v2.checker.pipeline.StageContext;
import com.lc.v2.checker.stage.examine.tools.ExamineToolRegistry;
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
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Tier-aware executor for non-PROGRAMMATIC rules.
 *
 * <table>
 *   <tr><th>checkType</th><th>Path</th></tr>
 *   <tr><td>AGENT</td>      <td>callPlain — single ChatClient call, no tools</td></tr>
 *   <tr><td>AGENT_TOOL</td> <td>callWithTools, max 1 round</td></tr>
 *   <tr><td>AGENTIC</td>    <td>callWithTools, up to rule.maxIterations rounds</td></tr>
 * </table>
 *
 * Spring AI 1.1's auto tool-execution loop drives the round-tripping.
 * {@link ExamineToolRegistry#beginCapture()} primes a thread-local list that
 * each {@code @Tool} method appends to; the captured timeline is attached to
 * the resulting {@link CheckResult}.
 */
@Component
public class AgentRuleExecutor {

    private static final Logger log = LoggerFactory.getLogger(AgentRuleExecutor.class);

    private final ChatClient.Builder chatClientBuilder;
    private final ArticleRefRegistry refs;
    private final ResourceLoader resourceLoader;
    private final ExamineToolRegistry toolRegistry;
    private final String systemPrompt;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ConcurrentMap<String, String> rulePromptCache = new ConcurrentHashMap<>();

    public AgentRuleExecutor(ChatClient.Builder chatClientBuilder,
                              ArticleRefRegistry refs,
                              ResourceLoader resourceLoader,
                              ExamineToolRegistry toolRegistry) throws IOException {
        this.chatClientBuilder = chatClientBuilder;
        this.refs = refs;
        this.resourceLoader = resourceLoader;
        this.toolRegistry = toolRegistry;
        try (InputStream in = new ClassPathResource("prompts/system/check-system.st").getInputStream()) {
            this.systemPrompt = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public CheckResult execute(Rule rule, StageContext ctx) {
        return switch (rule.checkType()) {
            case "AGENT" -> callPlain(rule, ctx);
            case "AGENT_TOOL" -> callWithTools(rule, ctx, 1);
            case "AGENTIC" -> callWithTools(rule, ctx,
                    rule.maxIterations() == null ? 4 : rule.maxIterations());
            default -> {
                log.warn("[{}] AgentRuleExecutor invoked for unsupported checkType={} rule={}",
                        ctx.sessionId, rule.checkType(), rule.ruleId());
                yield callPlain(rule, ctx);
            }
        };
    }

    private CheckResult callPlain(Rule rule, StageContext ctx) {
        String userPrompt = buildPrompt(rule, ctx, false);
        try {
            String response = chatClientBuilder.build().prompt()
                    .options(buildOptions(rule, null))
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .content();
            return parseResponse(rule.ruleId(), rule.checkType(), response, null);
        } catch (Exception e) {
            log.error("[{}] LLM call failed rule={}: {}", ctx.sessionId, rule.ruleId(), e.getMessage());
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.FAILED,
                    "LLM error: " + e.getClass().getSimpleName() + ": " + e.getMessage(),
                    null, 0.0, rule.checkType());
        }
    }

    private CheckResult callWithTools(Rule rule, StageContext ctx, int maxIterations) {
        String userPrompt = buildPrompt(rule, ctx, true);
        // Pass the session ID through the user prompt so the model can include it
        // in tool-call arguments (the registry takes sessionId as a parameter).
        userPrompt = "Session ID for tool calls: " + ctx.sessionId + "\n\n" + userPrompt;

        List<Map<String, Object>> toolCalls = toolRegistry.beginCapture();
        try {
            String response = chatClientBuilder.build().prompt()
                    .options(buildOptions(rule, maxIterations))
                    .system(systemPrompt)
                    .tools(toolRegistry)
                    .user(userPrompt)
                    .call()
                    .content();
            // AGENTIC convergence cap: if the model emitted no terminal JSON and we
            // hit the iteration ceiling, surface NEEDS_REVIEW with the trace.
            CheckResult parsed = parseResponse(rule.ruleId(), rule.checkType(), response,
                    new ArrayList<>(toolCalls));
            if (parsed.verdict() == CheckResult.Verdict.FAILED
                    && "AGENTIC".equals(rule.checkType())
                    && toolCalls.size() >= maxIterations) {
                return new CheckResult(rule.ruleId(), CheckResult.Verdict.NEEDS_REVIEW,
                        "max_iterations (" + maxIterations + ") reached without terminal verdict",
                        null, 0.0, rule.checkType(),
                        new ArrayList<>(toolCalls), null);
            }
            return parsed;
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

    /**
     * Build per-call ChatOptions. The global {@code enable_thinking: false} gate from
     * application.yml is the authoritative default; per-rule {@code thinking_enabled}
     * is captured here for downstream wiring but the OpenAiChatOptions surface in
     * Spring AI 1.1 does not expose vendor-specific extras directly on the per-call
     * builder, so the override is logged for now and applied via the application-level
     * config. Other knobs (temperature etc.) can be added here as the catalog grows.
     */
    private OpenAiChatOptions buildOptions(Rule rule, Integer maxIterations) {
        if (rule.thinkingEnabled() != null
                && Boolean.TRUE.equals(rule.thinkingEnabled())) {
            log.debug("rule={} requests enable_thinking=true; relying on application-level "
                    + "config (global gate stays in effect)", rule.ruleId());
        }
        return OpenAiChatOptions.builder().build();
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

    private String buildPrompt(Rule rule, StageContext ctx, boolean toolHint) {
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
            sb.append("\n\nYou have read-only tools available (getLcField, getDocField, "
                    + "getDocInventory, calculateDateDiff, listPresentedDocs). "
                    + "Call them when you need a specific field value or a date difference; "
                    + "do not guess. When ready, reply with terminal JSON: "
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
