package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.pipeline.StageContext;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

/**
 * Executes AGENT and PROGRAMMATIC_AGENT rules via Spring AI ChatClient.
 *
 * Prompt structure:
 *   System: officer role + JSON-only output contract
 *   User:   rule ID + relevant LC/doc field values + promptInstruction from catalog
 *
 * Expected response: {"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"...","confidence":0.0-1.0}
 *
 * The Spring AI ChatClient is auto-configured from spring.ai.openai.* in application.yml.
 * Provider switch (DashScope → Ollama) is purely config: change LLM_BASE_URL + LLM_MODEL.
 */
@Component
public class AgentRuleExecutor {

    private static final Logger log = LoggerFactory.getLogger(AgentRuleExecutor.class);

    private static final String SYSTEM_PROMPT = """
            You are an expert LC (Letter of Credit) compliance officer examining trade documents
            against UCP 600 and ISBP 821 rules.

            CRITICAL: Respond ONLY with a single JSON object. No prose, no markdown, no explanation outside JSON.

            Required format:
            {"verdict": "PASS|FAIL|NOT_APPLICABLE|DOUBTS", "explanation": "one sentence", "confidence": 0.0-1.0}

            Verdict definitions:
            - PASS:            document complies with the rule
            - FAIL:            clear discrepancy found that violates the rule
            - NOT_APPLICABLE:  required LC field absent, or rule conditions genuinely don't apply
            - DOUBTS:          genuinely ambiguous — insufficient evidence for a definitive call; use sparingly
            """;

    private final ChatClient chatClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AgentRuleExecutor(ChatClient.Builder chatClientBuilder) {
        this.chatClient = chatClientBuilder.build();
    }

    public CheckResult execute(Rule rule, StageContext ctx) {
        String userPrompt = buildPrompt(rule, ctx);
        try {
            String response = chatClient.prompt()
                    .system(SYSTEM_PROMPT)
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

    private String buildPrompt(Rule rule, StageContext ctx) {
        StringBuilder sb = new StringBuilder();
        sb.append("Rule: ").append(rule.ruleId()).append("\n\n");

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

        sb.append("\nCompliance check instruction:\n").append(rule.promptInstruction());
        return sb.toString();
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
