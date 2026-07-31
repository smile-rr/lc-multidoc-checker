package com.tb.helix.lccheck.stage.execute;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.prompt.Prompts;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.rule.RuleEvaluator;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.service.ModelSpend;
import com.tb.helix.lccheck.types.pipeline.StageId;

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
    private final DocumentTypes docTypes;
    private final RuleEvaluator rules;
    private final Prompts prompts;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;

    public ExecuteStage(CheckCatalog catalog, CaseStore cases, DocumentTypes docTypes,
                        RuleEvaluator rules, LlmGateway models, DerivationCache cache,
                        Prompts prompts, ObjectMapper json) {
        this.catalog = catalog;
        this.cases = cases;
        this.docTypes = docTypes;
        this.rules = rules;
        this.prompts = prompts;
        this.models = models;
        this.cache = cache;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.EXECUTE;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("facts", "Assembling what the documents say", this::assembleFacts),
                Step.<StageContext>of("checks", "Running the planned checks", this::runChecks));
    }

    /**
     * The fact sheet every judged check is measured against.
     *
     * <p>Its own step because it is built once and reused by all of them — and because its
     * digest is the cache key, so a change here invalidates every judgement. Worth being
     * able to see on the tape.
     */
    private StepResult assembleFacts(StageContext ctx) {
        String factSheet = factSheet(ctx);
        return StepResult.ok(Map.of(
                "digest", DerivationKey.sha256Hex(factSheet),
                "chars", factSheet.length()));
    }

    /**
     * Every planned check, grouped by the area the workbench draws.
     *
     * <p>One declared step for a fan-out whose width is the plan's, not the code's — so the
     * body re-announces per check. Areas still emit their own start/done events, because the
     * review screen fills in area by area.
     */
    private StepResult runChecks(StageContext ctx) {
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
            if (ctx.cancelled()) return StepResult.ok(Map.of("checks", plan.size(), "findings", raised));
            ctx.emit(HelixEvent.AREA_STARTED, Map.of("areaId", area.getKey()));

            for (var check : area.getValue()) {
                String checkId = check.checkId();
                // Named per check, not per area. A judged area is several model calls and
                // can run for a minute; "Time & availability" going quiet for that long is
                // indistinguishable from a stall.
                ctx.announce(checkId, check.name());
                try {
                    // An exact check is settled by comparing what was read, not by asking a
                    // model to compare it. That is the whole difference between the two
                    // tiers, and until now it was a label on a card: every check went to the
                    // same prompt, including "invoice value is at most credit amount".
                    boolean attention = settle(ctx, check, factSheet, factDigest);
                    raised += attention ? 1 : 0;
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

        return StepResult.done(raised + (raised == 1 ? " finding" : " findings"),
                Map.of("checks", plan.size(), "findings", raised));
    }

    /**
     * Settles one check, by the cheapest means that can answer it.
     *
     * <p>An exact check is evaluated against the facts. Where the author asked something a
     * comparison cannot answer — "does not conflict with" is UCP 600 art. 14(d) and is a
     * reading, not a test — the check falls through to the judged path with the rule as its
     * framing. Falling through is not a failure: the author expressed a judgement, so a
     * judge makes it. What must not happen is a judgement being implemented as a string
     * comparison and reported as deterministic.
     *
     * @return whether this produced something needing attention
     */
    private boolean settle(StageContext ctx, ReadRows.PlanCheck check,
                           String factSheet, String factDigest) {
        if (!"EXACT".equals(check.tier()) || check.ruleDef() == null) {
            return record(ctx, check, judge(check, factSheet, factDigest));
        }

        RuleEvaluator.Result result = rules.evaluate(parseRule(check.ruleDef()), readings(ctx));
        if (result.needsJudgement()) {
            log.info("Check {} asks for a reading rather than a comparison — judging", check.checkId());
            return record(ctx, check, judge(check, factSheet, factDigest));
        }
        return recordExact(ctx, check, result);
    }

    /**
     * Writes what the comparison found.
     *
     * <p>The rows go on the finding whatever the outcome, because the officer is shown the
     * comparison and not only its verdict — the point of an exact check is that the working
     * is visible. {@code statementSource} is {@code derived}: nobody drafted this wording,
     * it fell out of the values.
     */
    private boolean recordExact(StageContext ctx, ReadRows.PlanCheck check, RuleEvaluator.Result result) {
        String checkId = check.checkId();
        String severity = switch (result.outcome()) {
            case FAIL -> "discrepancy";
            case PASS -> "clean";
            // Not "clean". A check that could not be run has not passed, and reporting it as
            // clean is how an examination comes to claim it looked at something it did not.
            case INCONCLUSIVE -> "manual";
        };

        var failure = result.firstFailure().orElse(null);
        cases.upsertFinding(ctx.caseId(), Rows.of(
                "id", "f-" + checkId.toLowerCase(),
                "checkId", checkId,
                "severity", severity,
                "area", check.name(),
                "areaId", check.areaId(),
                "docId", failure == null ? null : docOf(failure),
                "title", check.name(),
                "statement", result.failed() ? result.why() : null,
                "statementSource", "derived",
                "detail", result.why(),
                "expected", failure == null ? null : failure.label(),
                "quote", failure == null ? null : failure.left(),
                "reason", check.ruleRef(),
                "failedRow", result.failedRowIndex(),
                // Every row, so the officer sees the whole comparison rather than the one
                // line that broke. This is what an exact check has that a judged one cannot.
                "comparison", result.rows().stream().map(r -> Rows.of(
                        "id", r.id(), "op", r.op(), "label", r.label(), "outcome", r.outcome().name(),
                        "left", r.left(), "right", r.right(), "why", r.why())).toList(),
                "confidence", result.outcome() == RuleEvaluator.Outcome.INCONCLUSIVE ? "LOW" : "HIGH"));

        ctx.recordStep(checkId, Map.of("verdict", result.outcome().name().toLowerCase(), "exact", true));
        ctx.emit(HelixEvent.FINDING, Map.of("findingId", "f-" + checkId.toLowerCase(), "severity", severity));
        return !"clean".equals(severity);
    }

    /** Which document a failed comparison points at, for the viewer to open. */
    private String docOf(RuleEvaluator.RowResult row) {
        String label = row.label();
        int at = label.indexOf(" on ");
        return at < 0 ? null : label.substring(at + 4).split(" ")[0];
    }

    /** The case's facts, in the shape the evaluator asks for. Mapping happens here, at the
     *  edge of the stage, so the engine never sees a persistence row. */
    private List<RuleEvaluator.Fact> readings(StageContext ctx) {
        return cases.facts(ctx.caseId()).stream()
                .map(f -> new RuleEvaluator.Fact(f.fieldKey(), f.docCode(), f.label(), f.value()))
                .toList();
    }

    private Object parseRule(String ruleDef) {
        try {
            return json.readValue(ruleDef, Object.class);
        } catch (Exception e) {
            log.warn("Could not read the rule definition: {}", e.toString());
            return null;
        }
    }

    private Map<String, Object> judge(ReadRows.PlanCheck check, String factSheet, String factDigest) {
        String checkId = check.checkId();
        String prompt = prompts.fill("examine-check", Map.of(
                "id", checkId,
                "name", check.name(),
                "because", nz(check.appliesBecause()),
                "authority", nz(check.ruleRef()),
                "facts", factSheet));

        var key = new DerivationKey(CacheOp.JUDGE_RULE, CacheOp.JUDGE_RULE_V, factDigest, checkId,
                DerivationKey.sha256Hex(prompt), "role:judge", null, Map.of());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            var result = models.complete(TextRequest.json(LlmRole.JUDGE, prompts.get("examine-system"), prompt));
            return new DerivationCache.Entry<>(parse(result.content()), null,
                    result.rawResponse(), ModelSpend.of(result.usage()));
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
                sb.append("  ").append(docTypes.label(doc)).append(" (").append(doc).append(")\n");
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



}
