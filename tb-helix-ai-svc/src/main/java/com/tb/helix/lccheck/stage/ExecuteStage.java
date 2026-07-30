package com.tb.helix.lccheck.stage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.harness.model.ModelGateway;
import com.tb.helix.harness.model.ModelRole;
import com.tb.helix.harness.model.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.catalog.CatalogPort;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Running the plan.
 *
 * <p>Checks are grouped into areas and areas reported as they return, because that is what
 * the workbench draws: a finding does not exist for the officer until the area that
 * produced it has come back.
 *
 * <p>A judged check is cached on a digest of <em>the facts it reads</em> rather than the
 * whole case, so correcting an unrelated field does not invalidate every conclusion
 * reached about the presentation.
 */
@Component
public class ExecuteStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(ExecuteStage.class);

    private final CatalogPort catalog;
    private final CaseStore cases;
    private final ModelGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;

    public ExecuteStage(CatalogPort catalog, CaseStore cases, ModelGateway models,
                        DerivationCache cache, ObjectMapper json) {
        this.catalog = catalog;
        this.cases = cases;
        this.models = models;
        this.cache = cache;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.EXECUTE;
    }

    @Override
    public StageOutcome execute(StageContext ctx) {
        List<Map<String, Object>> plan = cases.planChecks(ctx.caseId()).stream()
                .filter(c -> "PLANNED".equals(c.get("status")))
                .toList();

        Map<String, List<Map<String, Object>>> byArea = new LinkedHashMap<>();
        for (var c : plan) {
            byArea.computeIfAbsent(String.valueOf(c.getOrDefault("area_id", "a5")), k -> new ArrayList<>()).add(c);
        }

        String factSheet = factSheet(ctx);
        String factDigest = DerivationKey.sha256Hex(factSheet);
        int raised = 0;

        for (var area : byArea.entrySet()) {
            if (ctx.cancelled()) return StageOutcome.ok();
            ctx.emit(HelixEvent.AREA_STARTED, Map.of("areaId", area.getKey()));

            for (var check : area.getValue()) {
                String checkId = String.valueOf(check.get("check_id"));
                try {
                    Map<String, Object> verdict = judge(check, factSheet, factDigest);
                    raised += record(ctx, check, verdict) ? 1 : 0;
                    cases.setCheckStatus(ctx.caseId(), checkId, "DONE");
                } catch (RuntimeException e) {
                    // One check that could not run must not lose the other eighteen — but it
                    // must be visible, because a check silently skipped reads as a check passed.
                    log.warn("Check {} failed on case {}: {}", checkId, ctx.caseId(), e.toString());
                    cases.setCheckStatus(ctx.caseId(), checkId, "FAILED");
                    ctx.recordFailedStep(checkId, e.getMessage());
                }
            }
            ctx.emit(HelixEvent.AREA_DONE, Map.of("areaId", area.getKey()));
        }

        cases.patchCase(ctx.caseId(), Map.of("status", raised > 0 ? "discrepancies" : "clean"));
        ctx.recordStep("summary", Map.of("checks", plan.size(), "findings", raised));
        return StageOutcome.ok();
    }

    private Map<String, Object> judge(Map<String, Object> check, String factSheet, String factDigest) {
        String checkId = String.valueOf(check.get("check_id"));
        String prompt = CHECK_PROMPT.formatted(
                checkId,
                String.valueOf(check.get("name")),
                String.valueOf(check.getOrDefault("applies_because", "")),
                String.valueOf(check.getOrDefault("rule_ref", "")),
                factSheet);

        var key = new DerivationKey(CacheOp.JUDGE_RULE, CacheOp.JUDGE_RULE_V, factDigest, checkId,
                DerivationKey.sha256Hex(prompt), "role:judge", null, Map.of());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            var result = models.complete(TextRequest.json(ModelRole.JUDGE, EXAMINER_SYSTEM, prompt));
            return DerivationCache.Entry.of(parse(result.content()));
        });
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) hit.value();
        return out == null ? Map.of() : out;
    }

    /** @return whether this produced something needing attention */
    private boolean record(StageContext ctx, Map<String, Object> check, Map<String, Object> v) {
        String checkId = String.valueOf(check.get("check_id"));
        String verdict = String.valueOf(v.getOrDefault("verdict", "inconclusive")).toLowerCase();

        String severity = switch (verdict) {
            case "discrepancy", "fail" -> "discrepancy";
            case "possible", "doubt", "doubts" -> "possible";
            case "pass", "clean" -> "clean";
            default -> "manual";
        };

        cases.upsertFinding(ctx.caseId(), Rows.of(
                "id", "f-" + checkId.toLowerCase(),
                "checkId", checkId,
                "severity", severity,
                "area", check.get("name"),
                "areaId", check.get("area_id"),
                "docId", firstDoc(v),
                "title", v.getOrDefault("title", check.get("name")),
                "statement", v.get("statement"),
                "statementSource", "drafted",
                "detail", v.get("why"),
                "expected", v.get("expected"),
                "quote", v.get("presented"),
                "reason", check.get("rule_ref"),
                "confidence", String.valueOf(v.getOrDefault("confidence", "MED")).toUpperCase(),
                "analysis", Rows.of(
                        "requirement", v.get("expected"),
                        "presented", v.get("presented"),
                        "why", v.get("why"),
                        "options", v.getOrDefault("options", List.of()))));

        ctx.recordStep(checkId, Map.of("verdict", verdict));
        ctx.emit(HelixEvent.FINDING, Map.of("findingId", "f-" + checkId.toLowerCase(), "severity", severity));
        return !"clean".equals(severity);
    }

    /**
     * Everything read off the presentation, as the examiner sees it.
     *
     * <p>Inlined into the prompt rather than fetched by tools: the facts are already in
     * hand, and a tool round trip to hand a model something we hold is two extra completions
     * for no new information.
     */
    private String factSheet(StageContext ctx) {
        StringBuilder sb = new StringBuilder();
        Map<String, Object> row = cases.find(ctx.caseId()).orElseThrow();

        sb.append("THE CREDIT\n");
        for (String col : new String[] { "credit_ref", "applicant", "beneficiary", "currency", "amount",
                "tolerance_pct", "latest_shipment", "expiry", "expiry_place", "presentation_days",
                "tenor", "goods" }) {
            Object v = row.get(col);
            if (v != null && !String.valueOf(v).isBlank()) {
                sb.append("  ").append(col).append(": ").append(v).append('\n');
            }
        }

        String current = null;
        sb.append("\nTHE PRESENTATION\n");
        for (Map<String, Object> f : cases.facts(ctx.caseId())) {
            String doc = String.valueOf(f.get("doc_code"));
            if (!doc.equals(current)) {
                sb.append("  ").append(DocTypes.of(doc).label()).append(" (").append(doc).append(")\n");
                current = doc;
            }
            sb.append("    ").append(f.get("label")).append(": ").append(f.get("value"));
            if (f.get("page") != null) sb.append("   [p.").append(f.get("page")).append(']');
            sb.append('\n');
        }
        return sb.toString();
    }

    private String firstDoc(Map<String, Object> v) {
        Object d = v.get("document");
        return d == null ? "INV" : String.valueOf(d);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String content) {
        try {
            return json.readValue(content, Map.class);
        } catch (Exception e) {
            return Map.of("verdict", "inconclusive", "why", "The response could not be read as JSON.");
        }
    }


    private static final String EXAMINER_SYSTEM = """
            You are a documentary credit examiner working to UCP 600 and ISBP 821.

            Principles you do not depart from:

            1. Examine documents on their face, against the credit. Not against what the
               underlying transaction probably was.
            2. A discrepancy is a difference that matters under the credit or the rules. A
               difference that matters to nobody is not a discrepancy.
            3. Data need not be identical, but must not conflict — UCP 600 art. 14(d).
            4. If a document does not say something, say it does not. Do not infer it from
               another document.
            5. When you cannot tell, say inconclusive. An examiner who guesses is worse than
               one who asks, because the guess is indistinguishable from a finding.

            Answer only in the JSON shape you are given. No prose outside it.
            """;

    private static final String CHECK_PROMPT = """
            Check %s — %s

            Why it is in the plan: %s
            Authority: %s

            %s

            Decide whether the presentation satisfies this check, and answer:

            {
              "verdict":    "pass" | "discrepancy" | "possible" | "inconclusive",
              "title":      short headline an officer would scan,
              "statement":  the formal one-line wording for a refusal advice, UPPERCASE,
                            or null when the verdict is pass,
              "expected":   what the credit or the rules require,
              "presented":  what the documents actually say,
              "why":        why the difference matters, or why it does not,
              "document":   the document code the evidence sits on,
              "options":    ["what the officer could do"],
              "confidence": "HIGH" | "MED" | "LOW"
            }
            """;
}
