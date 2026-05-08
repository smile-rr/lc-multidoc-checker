package com.lc.v2.checker.stage.examine;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.domain.rule.DynamicCondition;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.StringJoiner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/**
 * COND-DYN — :47A: free-text condition decomposer (the only AGENTIC component
 * in v2; see {@code docs/architecture/rule-set.md} §3 and
 * {@code production-readiness.md} §6).
 *
 * <p>Reads the LC :47A: ADDITIONAL CONDITIONS prose, decomposes it into a
 * {@code List<DynamicCondition>} (one atomic, machine-checkable concern per
 * condition), and returns them. Caller (ExamineStage) handles caching by LC
 * content hash and per-condition execution via AgentRuleExecutor.
 *
 * <p>One LLM call per session (with thinking enabled), bounded by
 * {@code app.llm.max-iterations}. The catalog has no static {@code COND-*}
 * rule — this component IS the rule.
 */
@Component
public class ConditionDecomposer {

    private static final Logger log = LoggerFactory.getLogger(ConditionDecomposer.class);
    private static final String PROMPT_PATH = "classpath:/prompts/check/COND-DYN.st";

    private final ChatClient.Builder chatClientBuilder;
    private final ArticleRefRegistry refs;
    private final ObservationRegistry observationRegistry;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String promptTemplate;

    public ConditionDecomposer(ChatClient.Builder chatClientBuilder,
                               ArticleRefRegistry refs,
                               ResourceLoader resourceLoader,
                               ObservationRegistry observationRegistry) throws IOException {
        this.chatClientBuilder = chatClientBuilder;
        this.refs = refs;
        this.observationRegistry = observationRegistry;
        Resource r = resourceLoader.getResource(PROMPT_PATH);
        try (InputStream in = r.getInputStream()) {
            this.promptTemplate = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        log.info("ConditionDecomposer loaded; prompt template {} chars", promptTemplate.length());
    }

    /**
     * Content hash of the LC :47A: text + presented-doc set, suitable for caching
     * the decomposition output across re-runs of the same LC.
     */
    public static String cacheKey(String lc47a, Set<String> presentedDocs) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update((lc47a == null ? "" : lc47a).getBytes(StandardCharsets.UTF_8));
            md.update((byte) 0);
            for (String d : new java.util.TreeSet<>(presentedDocs)) {
                md.update(d.getBytes(StandardCharsets.UTF_8));
                md.update((byte) ',');
            }
            return HexFormat.of().formatHex(md.digest()).substring(0, 32);
        } catch (Exception e) {
            return "nokey";
        }
    }

    /**
     * Decompose the LC :47A: text into atomic conditions. Returns an empty list
     * when :47A: is empty/null. Throws on LLM error after the runtime exception
     * propagates; ExamineStage catches and degrades gracefully.
     */
    public List<DynamicCondition> decompose(String lc47a, String lc46a, Set<String> presentedDocs) {
        if (lc47a == null || lc47a.isBlank()) {
            log.info("COND-DYN skipped — :47A: empty");
            return List.of();
        }

        String userPrompt = buildUserPrompt(lc47a, lc46a, presentedDocs);
        // Resolve {{ref.X.text}} tokens against the corpus before sending.
        String resolvedSystem = refs.resolve(promptTemplate);

        Observation obs = Observation.createNotStarted("rule.COND-DYN", observationRegistry)
                .lowCardinalityKeyValue("rule_id", "COND-DYN")
                .lowCardinalityKeyValue("rule_check_type", "AGENTIC")
                .start();
        try (Observation.Scope ignored = obs.openScope()) {
            // AGENTIC: enable thinking so the model reasons about each clause's
            // intent before emitting the JSON. Match the pattern used by the
            // other AGENTIC code paths.
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                    .extraBody(java.util.Map.of("enable_thinking", true))
                    .build();
            String response = chatClientBuilder.build().prompt()
                    .options(options)
                    .system(resolvedSystem)
                    .user(userPrompt)
                    .call()
                    .content();
            return parseResponse(response);
        } catch (Exception e) {
            log.error("COND-DYN decomposer failed: {}", e.getMessage(), e);
            obs.error(e);
            return List.of();
        } finally {
            obs.stop();
        }
    }

    private String buildUserPrompt(String lc47a, String lc46a, Set<String> presentedDocs) {
        StringBuilder sb = new StringBuilder();
        sb.append("LC :47A: additional_conditions (verbatim):\n").append(lc47a.trim()).append("\n\n");
        if (lc46a != null && !lc46a.isBlank()) {
            sb.append("LC :46A: documents_required (verbatim):\n").append(lc46a.trim()).append("\n\n");
        }
        StringJoiner docs = new StringJoiner(", ");
        for (String d : presentedDocs) docs.add(d);
        sb.append("Presented doc types: [").append(docs).append("]\n\n");
        sb.append("Decompose into atomic conditions per the OUTPUT schema. Return JSON only.");
        return sb.toString();
    }

    private List<DynamicCondition> parseResponse(String response) {
        if (response == null || response.isBlank()) return List.of();
        try {
            String cleaned = response.trim();
            // Strip code fences defensively.
            if (cleaned.startsWith("```")) {
                int firstNl = cleaned.indexOf('\n');
                int lastFence = cleaned.lastIndexOf("```");
                if (firstNl > 0 && lastFence > firstNl) {
                    cleaned = cleaned.substring(firstNl + 1, lastFence).trim();
                }
            }
            JsonNode root = objectMapper.readTree(cleaned);
            JsonNode arr = root.path("conditions");
            if (!arr.isArray()) {
                log.warn("COND-DYN response missing 'conditions' array; got: {}",
                        cleaned.substring(0, Math.min(200, cleaned.length())));
                return List.of();
            }
            List<DynamicCondition> out = new ArrayList<>();
            int idx = 0;
            for (JsonNode node : arr) {
                idx++;
                String sourceText = node.path("source_text").asText("");
                if (sourceText.isBlank()) continue;
                List<String> appliesTo = readStringList(node.path("applies_to_docs"));
                List<String> ucp = readStringList(node.path("ucp_refs"));
                List<String> isbp = readStringList(node.path("isbp_refs"));
                String id = stableId(sourceText, idx);
                out.add(new DynamicCondition(
                        id,
                        sourceText,
                        appliesTo,
                        node.path("polarity").asText("POS"),
                        node.path("severity").asText("MAJOR"),
                        ucp,
                        isbp,
                        node.path("check_kind").asText("OUT_OF_SCOPE"),
                        node.path("check_prompt").asText("")
                ));
            }
            log.info("COND-DYN parsed {} condition(s)", out.size());
            return List.copyOf(out);
        } catch (Exception e) {
            log.error("COND-DYN parse failed: {} | raw={}", e.getMessage(),
                    response.substring(0, Math.min(400, response.length())));
            return List.of();
        }
    }

    private static List<String> readStringList(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<String> out = new ArrayList<>();
        for (JsonNode v : node) out.add(v.asText());
        return out;
    }

    private static String stableId(String sourceText, int idx) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(sourceText.getBytes(StandardCharsets.UTF_8));
            md.update((byte) (idx & 0xff));
            return HexFormat.of().formatHex(md.digest()).substring(0, 16);
        } catch (Exception e) {
            return Integer.toHexString(sourceText.hashCode()) + "_" + idx;
        }
    }

    // Type reference for ObjectMapper if needed elsewhere.
    @SuppressWarnings("unused")
    private static final TypeReference<List<DynamicCondition>> LIST_TYPE = new TypeReference<>() {};
}
