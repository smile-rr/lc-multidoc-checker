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
import com.lc.v2.checker.domain.rule.RuleOrigin;
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

    private static final Logger log = LoggerFactory.getLogger(RuleCatalogJoiner.class);

    /** Single source of truth for human-readable rule labels (server-canonical). */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("OP01-CURRENCY-CONSISTENT",          "Currency consistent across docs and LC"),
            Map.entry("OP02-AMOUNT-WITHIN-LC",             "Invoice (and draft) total within LC amount + tolerance"),
            Map.entry("OP03-DOC-DATE-VALID",               "No document dated later than presentation date"),
            Map.entry("OP04-PRESENTATION-WINDOW",          "Presentation within 21 days of shipment and before LC expiry"),
            Map.entry("OP05-BENEFICIARY-CONSISTENT",       "Beneficiary name consistent across all docs"),
            Map.entry("OP06-GOODS-DESCRIPTION-CORRESPONDS","Goods description corresponds with LC :45A:"),
            Map.entry("OP07-BL-ONBOARD-VALID",             "B/L on-board notation valid and ports match LC"),
            Map.entry("OP08-BL-CLEAN",                     "B/L is clean (no defect/damage clauses)"),
            Map.entry("OP09-46A-DOC-SET-COMPLETE",         "All :46A: required documents and originals presented"),
            Map.entry("OP10-BC-WC-46A-COMPLIANCE",         "Beneficiary / warranty certificate satisfies :46A:/:47A: conditions")
    );

    private final RuleCatalogRegistry catalog;
    private final ArticleRefRegistry refs;
    private final SessionStore sessionStore;

    public RuleCatalogJoiner(RuleCatalogRegistry catalog, ArticleRefRegistry refs,
                              SessionStore sessionStore) {
        this.catalog = catalog;
        this.refs = refs;
        this.sessionStore = sessionStore;
    }

    /**
     * Build the enriched rule list for a session by joining persisted check
     * results with the catalog + officer overrides.
     *
     * @param sessionId          session UUID
     * @param checkResults       parsed from final_report.results in the session
     * @param extractsByDocType  best-effort map of extraction confidence per doc; nullable
     */
    public List<EnrichedRule> join(String sessionId,
                                    List<CheckResult> checkResults,
                                    Map<DocType, DocumentExtract> extractsByDocType) {
        Map<String, Map<String, Object>> overridesByRule = sessionStore.getLatestOverridesByRule(sessionId);
        Map<String, Rule> adhocById = loadAdhocRules(sessionId);
        Map<String, List<String>> tracesById = loadTriggerTraces(sessionId);
        List<EnrichedRule> result = new ArrayList<>(checkResults.size());

        for (CheckResult cr : checkResults) {
            Rule rule = catalog.byId(cr.ruleId()).orElse(adhocById.get(cr.ruleId()));
            String label = LABELS.getOrDefault(cr.ruleId(), cr.ruleId());

            String severity = rule != null ? rule.severity() : "MINOR";
            String checkType = cr.checkType() != null ? cr.checkType()
                    : (rule != null ? rule.checkType() : "PROGRAMMATIC");
            String source = sourceFromCheckType(checkType);
            String article = primaryArticle(rule);
            List<String> scope = rule != null ? rule.scope() : List.of();
            List<ArticleRef> ucpFull = resolveRefs(rule == null ? null : rule.ucpRefs());
            List<ArticleRef> isbpFull = resolveRefs(rule == null ? null : rule.isbpRefs());

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
                    null,                       // reliab not yet tracked in POC
                    attention,
                    override,
                    ucpFull,
                    isbpFull,
                    rule != null ? rule.waivable() : null,
                    rule != null && rule.origin() != null ? rule.origin().name() : RuleOrigin.CATALOG.name(),
                    rule != null ? rule.evidenceLcClause() : null,
                    tracesById.get(cr.ruleId()),
                    rule != null ? rule.ucpExcerpt() : null
            ));
        }
        return result;
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Map<String, Rule> loadAdhocRules(String sessionId) {
        String json = sessionStore.getFinalReportSection(sessionId, "examine_meta");
        if (json == null || json.isBlank() || "null".equals(json)) return Map.of();
        try {
            Map<String, Object> meta = MAPPER.readValue(json, new TypeReference<>() {});
            Object list = meta.get("adhoc_rules");
            if (!(list instanceof List<?> rows) || rows.isEmpty()) return Map.of();
            Map<String, Rule> out = new LinkedHashMap<>();
            for (Object row : rows) {
                Rule r = MAPPER.convertValue(row, Rule.class);
                if (r != null && r.ruleId() != null) out.put(r.ruleId(), r);
            }
            return out;
        } catch (Exception e) {
            log.warn("Failed to load adhoc rules for session {}: {}", sessionId, e.toString());
            return Map.of();
        }
    }

    private Map<String, List<String>> loadTriggerTraces(String sessionId) {
        String json = sessionStore.getFinalReportSection(sessionId, "examine_meta");
        if (json == null || json.isBlank() || "null".equals(json)) return Map.of();
        try {
            Map<String, Object> meta = MAPPER.readValue(json, new TypeReference<>() {});
            Object traces = meta.get("trigger_traces");
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
        } catch (Exception e) {
            log.warn("Failed to load trigger traces for session {}: {}", sessionId, e.toString());
            return Map.of();
        }
    }

    private static String sourceFromCheckType(String checkType) {
        if (checkType == null) return "PROG";
        return switch (checkType) {
            case "PROGRAMMATIC" -> "PROG";
            case "AGENT" -> "AI";
            case "AGENT_TOOL" -> "AI+tool";
            case "AGENTIC_ADHOC" -> "AI·adhoc";
            case "PROGRAMMATIC_AGENT" -> "AI+tool"; // legacy alias
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

    private String formatArticle(ArticleRef ref) {
        if (ref == null) return "";
        String prefix = "ISBP821".equals(ref.source()) ? "ISBP" : "UCP 600";
        StringBuilder sb = new StringBuilder(prefix).append(" Art. ").append(ref.article());
        if (ref.paragraph() != null && !ref.paragraph().isBlank()) {
            sb.append("(").append(ref.paragraph()).append(")");
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
        if (rule.isAgent() && !"AGENT_TOOL".equals(rule.checkType())
                && !"PROGRAMMATIC_AGENT".equals(rule.checkType())) return "AI";
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
