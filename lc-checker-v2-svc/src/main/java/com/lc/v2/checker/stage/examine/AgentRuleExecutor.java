package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.common.ArticleRef;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import com.lc.v2.checker.pipeline.StageContext;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.StringJoiner;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * Executes AGENT, AGENT_TOOL, AGENTIC_ADHOC (and legacy PROGRAMMATIC_AGENT) rules
 * via Spring AI ChatClient.
 *
 * The system prompt is loaded from {@code classpath:/prompts/system/check-system.st}
 * at boot. Per-rule user prompts are looked up from
 * {@code classpath:/prompts/check/<rule-id>.st} (mirrors the v1 pattern); if the
 * file is absent, the executor falls back to {@code rule.promptInstruction()}.
 *
 * Each prompt also receives:
 *   - resolved UCP/ISBP citation text (from {@link ArticleRefRegistry})
 *   - the catalog's {@code ucp_excerpt} block (quoted authoritative text)
 *   - LC field values + per-doc field values for {@code fieldKeys}
 *
 * Expected response: {"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"...","confidence":0.0-1.0}
 */
@Component
public class AgentRuleExecutor {

    private static final Logger log = LoggerFactory.getLogger(AgentRuleExecutor.class);

    private final ChatClient chatClient;
    private final ArticleRefRegistry refs;
    private final ResourceLoader resourceLoader;
    private final String systemPrompt;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Per-rule prompt template cache; key = ruleId, value = "" sentinel if no .st file. */
    private final ConcurrentMap<String, String> rulePromptCache = new ConcurrentHashMap<>();

    public AgentRuleExecutor(ChatClient.Builder chatClientBuilder, ArticleRefRegistry refs,
                              ResourceLoader resourceLoader) throws IOException {
        this.chatClient = chatClientBuilder.build();
        this.refs = refs;
        this.resourceLoader = resourceLoader;
        try (InputStream in = new ClassPathResource("prompts/system/check-system.st").getInputStream()) {
            this.systemPrompt = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public CheckResult execute(Rule rule, StageContext ctx) {
        String userPrompt = buildPrompt(rule, ctx);
        try {
            String response = chatClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .content();
            return parseResponse(rule.ruleId(), rule.checkType(), response);
        } catch (Exception e) {
            log.error("[{}] LLM call failed rule={}: {}", ctx.sessionId, rule.ruleId(), e.getMessage());
            return new CheckResult(rule.ruleId(), CheckResult.Verdict.DOUBTS,
                    "LLM error: " + e.getMessage(), null, 0.0, rule.checkType());
        }
    }

    /**
     * Resolve the user-prompt body for {@code rule}. Looks up
     * {@code prompts/check/<ruleId>.st} from the classpath; on miss falls back to
     * the inline {@code prompt_instruction} from the catalog.
     */
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

    private String buildPrompt(Rule rule, StageContext ctx) {
        StringBuilder sb = new StringBuilder();
        sb.append("Rule: ").append(rule.ruleId()).append("\n\n");

        // Resolve referenced UCP/ISBP articles so the LLM sees the actual rule text
        // rather than just the IDs it's being asked to enforce.
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

        // Catalog-supplied authoritative excerpt — verbatim quote of the UCP/ISBP
        // text the rule enforces, including pitfall notes.
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
        return sb.toString();
    }

    private static String safeText(ArticleRef a) {
        String t = a.text();
        return t == null ? "" : t.replaceAll("\\s+", " ").trim();
    }

    private CheckResult parseResponse(String ruleId, String checkType, String response) {
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
            return new CheckResult(ruleId, verdict, explanation, null, confidence, checkType);
        } catch (Exception e) {
            log.warn("Failed to parse LLM response for rule {}: {} | raw={}", ruleId, e.getMessage(), response);
            return new CheckResult(ruleId, CheckResult.Verdict.DOUBTS,
                    "Response parse error: " + e.getMessage(), null, 0.0, checkType);
        }
    }
}
