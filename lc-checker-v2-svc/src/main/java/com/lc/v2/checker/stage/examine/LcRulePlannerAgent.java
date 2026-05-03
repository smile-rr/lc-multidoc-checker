package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.rule.ExamineContext;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import com.lc.v2.checker.pipeline.StageContext;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Proposes ad-hoc rules grounded in UCP 600 / ISBP 821 from the LC's :45A:, :46A:, :47A:.
 *
 * Workflow:
 *   1. Cache hit on sha256(lc_raw + catalog_version) → return cached, zero LLM cost.
 *   2. Else build a Spring AI prompt with the rule-planner.st template, call ChatClient
 *      at temperature 0.2, parse JSON {"rules": [...]}.
 *   3. Validate via AdhocRuleValidator (UCP/ISBP whitelist, dedupe, cap).
 *   4. Persist validated list to cache.
 *
 * Concurrency: invoked from ExamineStage as a CompletableFuture, parallel to PROGRAMMATIC
 * catalog evaluation. Returns empty list on any failure (catalog-only fallback).
 */
@Component
public class LcRulePlannerAgent {

    private static final Logger log = LoggerFactory.getLogger(LcRulePlannerAgent.class);

    private final ChatClient chatClient;
    private final ObjectMapper objectMapper;
    private final RuleCatalogRegistry catalog;
    private final AdhocRuleValidator validator;
    private final AdhocRuleCache cache;
    private final boolean enabled;

    public LcRulePlannerAgent(ChatClient.Builder chatClientBuilder,
                              ObjectMapper objectMapper,
                              RuleCatalogRegistry catalog,
                              AdhocRuleValidator validator,
                              AdhocRuleCache cache,
                              @Value("${rule.planner.enabled:false}") boolean enabled) {
        this.chatClient = chatClientBuilder.build();
        this.objectMapper = objectMapper;
        this.catalog = catalog;
        this.validator = validator;
        this.cache = cache;
        this.enabled = enabled;
    }

    public List<Rule> propose(StageContext ctx, ExamineContext ec) {
        if (!enabled) {
            log.debug("[{}] planner disabled (rule.planner.enabled=false)", ctx.sessionId);
            return List.of();
        }
        if (ctx.lc == null || ctx.lc.rawMt700() == null) return List.of();

        String key = cache.keyFor(ctx.lc.rawMt700());
        Optional<List<Rule>> hit = cache.get(key);
        if (hit.isPresent()) {
            log.info("[{}] planner cache hit: {} ad-hoc rules", ctx.sessionId, hit.get().size());
            return hit.get();
        }

        try {
            String userPrompt = renderUserPrompt(ctx, ec);
            String response = chatClient.prompt()
                    .system("You output JSON only. No prose, no markdown.")
                    .user(userPrompt)
                    .options(org.springframework.ai.chat.prompt.ChatOptions.builder()
                            .temperature(0.2)
                            .build())
                    .call()
                    .content();
            List<Rule> proposals = parseRules(response);
            List<Rule> validated = validator.validate(proposals);
            cache.put(key, validated);
            log.info("[{}] planner proposed {} → validated {} ad-hoc rules",
                    ctx.sessionId, proposals.size(), validated.size());
            return validated;
        } catch (Exception e) {
            log.warn("[{}] planner call failed: {}", ctx.sessionId, e.getMessage());
            return List.of();
        }
    }

    private String renderUserPrompt(StageContext ctx, ExamineContext ec) throws IOException {
        String template;
        try (InputStream in = new ClassPathResource("prompts/system/rule-planner.st").getInputStream()) {
            template = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        Map<String, String> raw = ctx.lc.rawFields();
        return template
                .replace("{active_rule_ids}", joinRuleIds())
                .replace("{f45a}", safe(raw.get("45A")))
                .replace("{f46a}", safe(raw.get("46A")))
                .replace("{f47a}", safe(raw.get("47A")))
                .replace("{lc_envelope}", safe(toJson(ec.lcFields())))
                .replace("{lc_derived}", safe(toJson(ec.lcDerived())))
                .replace("{presented_docs}", safe(ec.presentedDocTypes().toString()));
    }

    private String joinRuleIds() {
        StringBuilder sb = new StringBuilder();
        for (Rule r : catalog.enabledRules()) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(r.ruleId());
        }
        return sb.toString();
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private List<Rule> parseRules(String response) throws IOException {
        if (response == null) return List.of();
        String cleaned = response.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replaceAll("(?s)^```[a-z]*\\n?", "")
                    .replaceAll("\\n?```$", "").trim();
        }
        JsonNode root = objectMapper.readTree(cleaned);
        JsonNode rulesNode = root.path("rules");
        if (!rulesNode.isArray()) return List.of();
        List<Rule> out = new ArrayList<>(rulesNode.size());
        for (JsonNode n : rulesNode) {
            try {
                Rule r = objectMapper.treeToValue(n, Rule.class);
                if (r != null) out.add(r);
            } catch (Exception e) {
                log.debug("planner produced unparseable rule: {}", e.getMessage());
            }
        }
        return out;
    }
}
