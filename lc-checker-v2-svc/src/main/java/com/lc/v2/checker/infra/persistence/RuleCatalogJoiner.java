package com.lc.v2.checker.infra.persistence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lc.v2.checker.api.dto.EnrichedRule;
import com.lc.v2.checker.api.dto.OverrideRecord;
import com.lc.v2.checker.domain.common.ArticleRef;
import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.document.DocumentExtract;
import com.lc.v2.checker.domain.result.CheckResult;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.infra.refs.ArticleRefRegistry;
import com.lc.v2.checker.infra.rules.RuleCatalogRegistry;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Server-side join: CheckResult × Rule catalog × officer overrides → EnrichedRule[].
 *
 * Computes attention chips (LOW-CONF-PASS / SPLIT / AGENT-DISAGREE / HANDWRITING /
 * OVERRIDDEN / FLAGGED) from the available signals so the UI doesn't need to.
 */
@Component
public class RuleCatalogJoiner {

    /** Backend-computed wall-clock for a single rule, sourced from
     *  {@code v_check_results.duration_ms / started_at / completed_at}. */
    public record RuleTiming(Long durationMs, String startedAt, String completedAt) {
        public static final RuleTiming EMPTY = new RuleTiming(null, null, null);
    }

    private static final Logger log = LoggerFactory.getLogger(RuleCatalogJoiner.class);

    /** Single source of truth for human-readable rule labels (server-canonical). */
    /**
     * Topic-prefix catalog labels. The catalog's {@code name} field is the source
     * of truth; this static map is a fallback used only when a result references
     * a rule no longer present in the catalog (e.g. mid-migration rows).
     */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("CCY-01",   "Currency consistent across LC, invoice, and draft"),
            Map.entry("AMT-01",   "Invoice amount within LC (respecting :39A: tolerance)"),
            Map.entry("AMT-02",   "Draft amount equals invoice amount"),
            Map.entry("DATE-01",  "No document dated later than presentation date"),
            Map.entry("DATE-02",  "Presentation within 21 days of shipment and before LC expiry"),
            Map.entry("PARTY-01", "Invoice issued by the beneficiary"),
            Map.entry("PARTY-02", "Beneficiary name consistent across all submitted documents"),
            Map.entry("PARTY-03", "Draft drawn on the drawee named in the credit"),
            Map.entry("GOODS-01", "Invoice goods description corresponds to LC :45A:"),
            Map.entry("GOODS-02", "Quantity / packages consistent between invoice and packing list"),
            Map.entry("GOODS-03", "Shipping marks consistent between packing list and B/L"),
            Map.entry("SHIP-01",  "B/L bears on-board notation"),
            Map.entry("SHIP-02",  "B/L ports of loading and discharge match LC"),
            Map.entry("SHIP-03",  "Invoice Incoterms consistent with B/L freight notation"),
            Map.entry("DOC-01",   "Full set of B/L originals presented"),
            Map.entry("DOC-02",   "B/L is clean (no defect or damage clauses)"),
            Map.entry("DOC-03",   "Beneficiary certificate signed when LC requires signature"),
            Map.entry("DOC-04",   "Documents comply on face with LC terms (general)"),
            Map.entry("COND-01",  "Beneficiary certificate satisfies all :46A: / :47A: conditions"),
            Map.entry("COND-02",  "Warranty certificate satisfies all :46A: / :47A: conditions")
    );

    private final RuleCatalogRegistry catalog;
    private final ArticleRefRegistry refs;
    private final SessionStore sessionStore;

    /** Text-LLM model used by AGENT-tier rule checks; sourced from Spring AI config. */
    @org.springframework.beans.factory.annotation.Value("${spring.ai.openai.chat.options.model:}")
    private String agentModelId;

    public RuleCatalogJoiner(RuleCatalogRegistry catalog, ArticleRefRegistry refs,
                              SessionStore sessionStore) {
        this.catalog = catalog;
        this.refs = refs;
        this.sessionStore = sessionStore;
    }

    private static boolean isAgentTier(String checkType) {
        return checkType != null && (checkType.equals("AGENT")
                || checkType.equals("AGENT_TOOL")
                || checkType.equals("AGENTIC")
                || checkType.equals("PROGRAMMATIC_AGENT"));
    }

    /**
     * Build the enriched rule list for a session by joining persisted check
     * results with the catalog + officer overrides.
     *
     * @param sessionId          session UUID
     * @param checkResults       read from v_check_results (pipeline_steps examine/&lt;rule_id&gt;)
     * @param extractsByDocType  best-effort map of extraction confidence per doc; nullable
     */
    public List<EnrichedRule> join(String sessionId,
                                    List<CheckResult> checkResults,
                                    Map<DocType, DocumentExtract> extractsByDocType) {
        return join(sessionId, checkResults, extractsByDocType, Map.of());
    }

    public List<EnrichedRule> join(String sessionId,
                                    List<CheckResult> checkResults,
                                    Map<DocType, DocumentExtract> extractsByDocType,
                                    Map<String, RuleTiming> timingByRule) {
        Map<String, Map<String, Object>> overridesByRule = sessionStore.getLatestOverridesByRule(sessionId);
        Map<String, List<String>> tracesById = loadTriggerTraces(sessionId);
        Map<String, Map<String, Object>> tracesByRuleResult = loadResultExtras(sessionId);
        List<EnrichedRule> result = new ArrayList<>(checkResults.size());

        for (CheckResult cr : checkResults) {
            Rule rule = catalog.byId(cr.ruleId()).orElse(null);
            Map<String, Object> extras = tracesByRuleResult.getOrDefault(cr.ruleId(), Map.of());

            // For dyn:* rules synthesized at runtime there's no catalog match;
            // pull name/severity/refs/check_type from the persisted result JSON.
            String label = rule != null && rule.name() != null
                    ? rule.name()
                    : (extras.get("name") instanceof String s ? s
                        : LABELS.getOrDefault(cr.ruleId(), cr.ruleId()));

            String severity = rule != null ? rule.severity()
                    : (extras.get("severity") instanceof String s ? s : "MINOR");
            String checkType = cr.checkType() != null ? cr.checkType()
                    : (rule != null ? rule.checkType()
                        : (extras.get("check_type") instanceof String s ? s : "PROGRAMMATIC"));
            String source = sourceFromCheckType(checkType);
            String article = primaryArticle(rule);
            @SuppressWarnings("unchecked")
            List<String> extraScope = extras.get("scope") instanceof List<?> ls
                    ? (List<String>) ls : null;
            List<String> scope = rule != null ? rule.scope()
                    : (extraScope != null ? extraScope : List.of());
            @SuppressWarnings("unchecked")
            List<String> ucpRefIds = rule != null ? rule.ucpRefs()
                    : (extras.get("ucp_refs") instanceof List<?> ls ? (List<String>) ls : null);
            @SuppressWarnings("unchecked")
            List<String> isbpRefIds = rule != null ? rule.isbpRefs()
                    : (extras.get("isbp_refs") instanceof List<?> ls ? (List<String>) ls : null);
            List<ArticleRef> ucpFull = resolveRefs(ucpRefIds);
            List<ArticleRef> isbpFull = resolveRefs(isbpRefIds);

            // Override (if any)
            Map<String, Object> ovRow = overridesByRule.get(cr.ruleId());
            OverrideRecord override = ovRow == null ? null : new OverrideRecord(
                    (String) ovRow.get("new_status"),
                    (String) ovRow.get("reason"),
                    (String) ovRow.get("note"),
                    Boolean.TRUE.equals(ovRow.get("flagged")),
                    toInstant(ovRow.get("created_at"))
            );
            String effectiveVerdict = override != null && override.newStatus() != null
                    ? override.newStatus()
                    : cr.verdict().name();

            // Evidence — pull lc / doc fields out of CheckResult.evidence map
            Map<String, Object> evidence = extractEvidence(cr);

            // Attention chips
            List<String> attention = computeAttention(cr, rule, override, extractsByDocType);

            // Agreement signal — derive from primary doc's confidence tier when available
            String agree = computeAgree(rule, extractsByDocType);

            RuleTiming t = timingByRule.getOrDefault(cr.ruleId(), RuleTiming.EMPTY);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> toolCalls = (List<Map<String, Object>>) extras.get("tool_calls");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> conditionResults = (List<Map<String, Object>>) extras.get("condition_results");
            result.add(new EnrichedRule(
                    cr.ruleId(),
                    label,
                    article,
                    scope,
                    severity,
                    checkType,
                    source,
                    cr.verdict().name(),
                    effectiveVerdict,
                    cr.explanation(),
                    evidence,
                    cr.confidence(),
                    agree,
                    null,
                    attention,
                    override,
                    ucpFull,
                    isbpFull,
                    rule != null ? rule.waivable() : null,
                    tracesById.get(cr.ruleId()),
                    rule != null ? rule.ucpExcerpt() : null,
                    t.durationMs(),
                    t.startedAt(),
                    t.completedAt(),
                    rule != null ? rule.canonicalField() : null,
                    toolCalls,
                    conditionResults,
                    isAgentTier(checkType) && agentModelId != null && !agentModelId.isBlank()
                            ? agentModelId : null
            ));
        }
        return result;
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Read examine/meta from pipeline_steps. */
    private Map<String, Object> readExamineMeta(String sessionId) {
        Map<String, Object> meta = sessionStore.getExamineMeta(sessionId);
        if (meta == null) return Map.of();
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            String traces = (String) meta.get("trigger_traces");
            if (traces != null && !traces.isBlank()) {
                out.put("trigger_traces", MAPPER.readValue(traces, new TypeReference<Map<String, Object>>() {}));
            }
        } catch (Exception e) {
            log.warn("Failed to parse examine meta for session {}: {}", sessionId, e.toString());
        }
        return out;
    }

    private Map<String, List<String>> loadTriggerTraces(String sessionId) {
        Object traces = readExamineMeta(sessionId).get("trigger_traces");
        if (!(traces instanceof Map<?, ?> m)) return Map.of();
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            if (e.getValue() instanceof List<?> ls) {
                List<String> strs = new ArrayList<>(ls.size());
                for (Object o : ls) strs.add(String.valueOf(o));
                out.put(String.valueOf(e.getKey()), strs);
            }
        }
        return out;
    }

    /**
     * Pull {@code tool_calls} and {@code condition_results} from each
     * {@code pipeline_steps(examine/<rule_id>).result} JSONB so the UI drawer
     * can render the agent timeline. Returns an empty map on any read error.
     */
    private Map<String, Map<String, Object>> loadResultExtras(String sessionId) {
        try {
            Map<String, String> raw = sessionStore.getExamineRuleResultJson(sessionId);
            Map<String, Map<String, Object>> out = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : raw.entrySet()) {
                String json = e.getValue();
                if (json == null || json.isBlank()) continue;
                try {
                    Map<String, Object> parsed = MAPPER.readValue(json, new TypeReference<>() {});
                    Map<String, Object> extras = new LinkedHashMap<>();
                    if (parsed.get("tool_calls") instanceof List<?> tc && !tc.isEmpty()) {
                        extras.put("tool_calls", tc);
                    }
                    if (parsed.get("condition_results") instanceof List<?> cr && !cr.isEmpty()) {
                        extras.put("condition_results", cr);
                    }
                    // Surface synth metadata for dyn:* rules so join() can show a
                    // proper name / severity / check_type / refs in the worklist.
                    if (e.getKey().startsWith("dyn:")) {
                        if (parsed.get("name") instanceof String s) extras.put("name", s);
                        if (parsed.get("check_type") instanceof String s) extras.put("check_type", s);
                        if (parsed.get("severity") instanceof String s) extras.put("severity", s);
                        if (parsed.get("ucp_refs") instanceof List<?> ls) extras.put("ucp_refs", ls);
                        if (parsed.get("isbp_refs") instanceof List<?> ls) extras.put("isbp_refs", ls);
                        if (parsed.get("applies_to_docs") instanceof List<?> ls) extras.put("scope", ls);
                    }
                    if (!extras.isEmpty()) out.put(e.getKey(), extras);
                } catch (Exception ignored) { /* best-effort */ }
            }
            return out;
        } catch (Exception e) {
            log.debug("loadResultExtras failed for {}: {}", sessionId, e.getMessage());
            return Map.of();
        }
    }

    /**
     * Tier label rendered in the worklist row.
     *   PROGRAMMATIC → PROG · AGENT → AGENT · AGENT_TOOL → AGENT+T · AGENTIC → AGENTIC
     */
    private static String sourceFromCheckType(String checkType) {
        if (checkType == null) return "PROG";
        return switch (checkType) {
            case "PROGRAMMATIC" -> "PROG";
            case "AGENT" -> "AGENT";
            case "AGENT_TOOL" -> "AGENT+T";
            case "AGENTIC" -> "AGENTIC";
            default -> "PROG";
        };
    }

    private String primaryArticle(Rule rule) {
        if (rule == null || rule.ucpRefs().isEmpty()) {
            if (rule != null && !rule.isbpRefs().isEmpty()) {
                return refs.byId(rule.isbpRefs().get(0))
                        .map(this::formatArticle).orElse(rule.isbpRefs().get(0));
            }
            return "";
        }
        return refs.byId(rule.ucpRefs().get(0))
                .map(this::formatArticle).orElse(rule.ucpRefs().get(0));
    }

    /**
     * Compact article label for the worklist column. Examiners recognise
     * "UCP 18a-iii" / "ISBP C8" instantly; the verbose
     * "UCP 600 Art. 18(a(iii))" wastes column width and is harder to scan.
     *
     * Format:  &lt;prefix&gt; &lt;article&gt;&lt;paragraph&gt;   with parens replaced by hyphens.
     *   UCP-18-a-3    → "UCP 18a-3"
     *   UCP-30-b      → "UCP 30b"
     *   ISBP-C8       → "ISBP C8"
     */
    private String formatArticle(ArticleRef ref) {
        if (ref == null) return "";
        String prefix = "ISBP821".equals(ref.source()) ? "ISBP" : "UCP";
        StringBuilder sb = new StringBuilder(prefix).append(" ").append(ref.article());
        if (ref.paragraph() != null && !ref.paragraph().isBlank()) {
            String para = ref.paragraph()
                    .replace("(", "-")
                    .replace(")", "");
            // ISBP paragraphs already include the section letter (e.g. "C8");
            // UCP paragraphs are short ("a", "a-iii") and concatenate directly.
            sb.append(para);
        }
        return sb.toString();
    }

    private List<ArticleRef> resolveRefs(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<ArticleRef> out = new ArrayList<>(ids.size());
        for (String id : ids) {
            Optional<ArticleRef> r = refs.byId(id);
            r.ifPresent(out::add);
        }
        return out;
    }

    private Map<String, Object> extractEvidence(CheckResult cr) {
        if (cr.evidence() == null || cr.evidence().isEmpty()) return null;
        Map<String, Object> evidence = new LinkedHashMap<>();
        Object lc = cr.evidence().get("lc");
        Object doc = cr.evidence().get("doc");
        if (lc != null) evidence.put("lc", lc.toString());
        if (doc != null) evidence.put("doc", doc.toString());
        // Fallback: include the whole map under "details" if no lc/doc keys
        if (evidence.isEmpty()) evidence.put("details", cr.evidence());
        return evidence;
    }

    private List<String> computeAttention(CheckResult cr, Rule rule, OverrideRecord override,
                                           Map<DocType, DocumentExtract> extractsByDocType) {
        List<String> chips = new ArrayList<>();
        if (override != null) chips.add("OVERRIDDEN");
        if (override != null && override.flagged()) chips.add("FLAGGED");

        // Low-confidence pass
        if (cr.verdict() == CheckResult.Verdict.PASS && cr.confidence() < 0.80) {
            chips.add("LOW-CONF-PASS");
        }

        // Per-doc extraction signals
        if (rule != null && extractsByDocType != null) {
            for (String docName : rule.scope()) {
                DocType dt = safeDocType(docName);
                if (dt == null) continue;
                DocumentExtract extract = extractsByDocType.get(dt);
                if (extract == null) continue;
                if (extract.overallConfidence() == DocumentExtract.ExtractionConfidence.MED
                        && !chips.contains("SPLIT")) {
                    chips.add("SPLIT");
                }
                if (extract.overallConfidence() == DocumentExtract.ExtractionConfidence.LOW
                        && !chips.contains("AGENT-DISAGREE")) {
                    chips.add("AGENT-DISAGREE");
                }
                if (extract.hasOffSchemaItem("handwritten") || extract.hasOffSchemaItem("handwritten-note")
                        || extract.hasOffSchemaItem("handwritten-correction")) {
                    if (!chips.contains("HANDWRITING")) chips.add("HANDWRITING");
                }
            }
        }
        return chips;
    }

    private String computeAgree(Rule rule, Map<DocType, DocumentExtract> extractsByDocType) {
        if (rule == null || extractsByDocType == null) return "—";
        if (rule.isAgent()) return "AGENT";
        // For PROG / PROG+AI, derive from primary doc's consensus tier
        for (String docName : rule.scope()) {
            DocType dt = safeDocType(docName);
            if (dt == null) continue;
            DocumentExtract extract = extractsByDocType.get(dt);
            if (extract == null) continue;
            return switch (extract.overallConfidence()) {
                case HIGH -> "3/3";
                case MED -> "2/3";
                case LOW -> "1/3";
            };
        }
        return "—";
    }

    private static DocType safeDocType(String name) {
        try { return DocType.valueOf(name); }
        catch (IllegalArgumentException e) { return null; }
    }

    private static Instant toInstant(Object o) {
        if (o == null) return null;
        if (o instanceof Instant i) return i;
        if (o instanceof Timestamp t) return t.toInstant();
        if (o instanceof java.util.Date d) return d.toInstant();
        return null;
    }
}
