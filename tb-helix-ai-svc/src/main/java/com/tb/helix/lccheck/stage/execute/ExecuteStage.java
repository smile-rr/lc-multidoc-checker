package com.tb.helix.lccheck.stage.execute;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.types.DocType;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.types.StageId;
import com.tb.helix.lccheck.types.pipeline.StageOutcome;

import com.fasterxml.jackson.databind.ObjectMapper;
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

    private final CheckCatalog catalog;
    private final CaseStore cases;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;

    public ExecuteStage(CheckCatalog catalog, CaseStore cases, LlmGateway models,
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
        List<ReadRows.PlanCheck> plan = cases.planChecks(ctx.caseId()).stream()
                .filter(c -> "PLANNED".equals(c.status()))
                .toList();

        Map<String, List<ReadRows.PlanCheck>> byArea = new LinkedHashMap<>();
        for (var c : plan) {
            byArea.computeIfAbsent(c.areaId() == null ? "a5" : c.areaId(), k -> new ArrayList<>()).add(c);
        }

        String factSheet = factSheet(ctx);
        String factDigest = DerivationKey.sha256Hex(factSheet);
        int raised = 0;

        for (var area : byArea.entrySet()) {
            if (ctx.cancelled()) return StageOutcome.ok();
            ctx.emit(HelixEvent.AREA_STARTED, Map.of("areaId", area.getKey()));

            for (var check : area.getValue()) {
                String checkId = check.checkId();
                // Named per check, not per area. A judged area is several model calls and
                // can run for a minute; "Time & availability" going quiet for that long is
                // indistinguishable from a stall.
                ctx.progress("check", check.name());
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

    private Map<String, Object> judge(ReadRows.PlanCheck check, String factSheet, String factDigest) {
        String checkId = check.checkId();
        String prompt = CHECK_PROMPT.formatted(
                checkId,
                check.name(),
                nz(check.appliesBecause()),
                nz(check.ruleRef()),
                factSheet);

        var key = new DerivationKey(CacheOp.JUDGE_RULE, CacheOp.JUDGE_RULE_V, factDigest, checkId,
                DerivationKey.sha256Hex(prompt), "role:judge", null, Map.of());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            var result = models.complete(TextRequest.json(LlmRole.JUDGE, EXAMINER_SYSTEM, prompt));
            return DerivationCache.Entry.of(parse(result.content()));
        });
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) hit.value();
        return out == null ? Map.of() : out;
    }

    /** @return whether this produced something needing attention */
    private boolean record(StageContext ctx, ReadRows.PlanCheck check, Map<String, Object> v) {
        String checkId = check.checkId();
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
                "area", check.name(),
                "areaId", check.areaId(),
                "docId", firstDoc(v),
                "title", v.getOrDefault("title", check.name()),
                "statement", v.get("statement"),
                "statementSource", "drafted",
                "detail", v.get("why"),
                "expected", v.get("expected"),
                "quote", v.get("presented"),
                "reason", check.ruleRef(),
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
    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** One credit term, omitted entirely when the credit does not state it. */
    private static void term(StringBuilder sb, String label, Object value) {
        if (value == null || String.valueOf(value).isBlank()) return;
        sb.append("  ").append(label).append(": ").append(value).append('\n');
    }

    private String factSheet(StageContext ctx) {
        StringBuilder sb = new StringBuilder();
        CaseRow c = cases.find(ctx.caseId()).orElseThrow();

        // Labelled in words rather than column names. The loop this replaces printed the
        // schema at the model — "latest_shipment", "tolerance_pct" — and a prompt reads
        // better, and more like the credit it describes, in English.
        sb.append("THE CREDIT\n");
        term(sb, "credit reference", c.creditRef());
        term(sb, "applicant", c.applicant());
        term(sb, "beneficiary", c.beneficiary());
        term(sb, "currency", c.currency());
        term(sb, "amount", c.amount());
        term(sb, "tolerance %", c.tolerancePct());
        term(sb, "latest shipment", c.latestShipment());
        term(sb, "expiry", c.expiry());
        term(sb, "place of expiry", c.expiryPlace());
        term(sb, "presentation period (days)", c.presentationDays());
        term(sb, "tenor", c.tenor());
        term(sb, "goods", c.goods());

        String current = null;
        sb.append("\nTHE PRESENTATION\n");
        for (ReadRows.Fact f : cases.facts(ctx.caseId())) {
            String doc = f.docCode();
            if (!doc.equals(current)) {
                sb.append("  ").append(DocType.of(doc).label()).append(" (").append(doc).append(")\n");
                current = doc;
            }
            sb.append("    ").append(f.label()).append(": ").append(f.value());
            if (f.page() != null) sb.append("   [p.").append(f.page()).append(']');
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
