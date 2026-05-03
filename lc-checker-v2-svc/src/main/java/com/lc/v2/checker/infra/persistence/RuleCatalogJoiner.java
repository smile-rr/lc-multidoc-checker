package com.lc.v2.checker.infra.persistence;

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

    private static final Logger log = LoggerFactory.getLogger(RuleCatalogJoiner.class);

    /** Single source of truth for human-readable rule labels (server-canonical). */
    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("GEN-001", "Every document complies on face with LC terms"),
            Map.entry("GEN-003", "No document dated later than presentation date"),
            Map.entry("INV-001", "Invoice issued by the beneficiary"),
            Map.entry("INV-003", "Invoice in same currency as LC"),
            Map.entry("INV-005", "Invoice amount must not exceed LC amount"),
            Map.entry("INV-006", "Goods description corresponds to :45A:"),
            Map.entry("BOL-003", "B/L on-board or has on-board notation"),
            Map.entry("BOL-005", "B/L shows correct port of loading and discharge"),
            Map.entry("BOL-007", "Full set of originals presented as per B/L"),
            Map.entry("BOL-009", "B/L is clean (no defect/damage clauses)"),
            Map.entry("PKL-003", "Quantity/packages in PKL must not contradict invoice"),
            Map.entry("PKL-004", "Shipping marks in PKL must not contradict B/L"),
            Map.entry("BOE-001", "Draft drawn on party stated in LC"),
            Map.entry("BOE-003", "Draft amount equals invoice amount"),
            Map.entry("BC-001",  "BC content satisfies all :46A: conditions"),
            Map.entry("BC-003",  "If LC requires signed BC, must bear beneficiary signature"),
            Map.entry("WC-001",  "Warranty content satisfies all :46A: conditions"),
            Map.entry("XD-004",  "Invoice quantity must match Packing List"),
            Map.entry("XD-022",  "Beneficiary name consistent across all submitted docs"),
            Map.entry("XD-024",  "Invoice Incoterms consistent with B/L freight notation")
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
        List<EnrichedRule> result = new ArrayList<>(checkResults.size());

        for (CheckResult cr : checkResults) {
            Rule rule = catalog.byId(cr.ruleId()).orElse(null);
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
                    rule != null ? rule.waivable() : null
            ));
        }
        return result;
    }

    private static String sourceFromCheckType(String checkType) {
        if (checkType == null) return "PROG";
        return switch (checkType) {
            case "PROGRAMMATIC" -> "PROG";
            case "AGENT" -> "AI";
            case "PROGRAMMATIC_AGENT" -> "PROG+AI";
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
        if ("AGENT".equals(rule.checkType())) return "AI";
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
