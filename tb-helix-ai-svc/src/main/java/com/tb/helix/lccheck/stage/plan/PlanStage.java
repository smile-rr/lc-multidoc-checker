package com.tb.helix.lccheck.stage.plan;

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
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.service.ModelSpend;
import com.tb.helix.lccheck.types.examination.Origin;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.stage.intake.IntakeStage;
import com.tb.helix.lccheck.types.examination.Areas;
import com.tb.helix.lccheck.types.pipeline.StageId;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * What this credit demands, and which rules answer it.
 *
 * <p>Two kinds of card come out, and the difference is who can answer for them:
 *
 * <ul>
 *   <li><b>Rule cards</b> — standing checks from the dictionary. Authored in Governance,
 *       reviewed before they ever ran, the same on every credit.
 *   <li><b>Requirement cards</b> — read out of <em>this</em> credit's {@code :46A:} and
 *       {@code :47A:} during the run. Per case, reviewed by nobody.
 * </ul>
 *
 * <p>A requirement the planner found and no rule tests is still a requirement card, marked
 * {@code notCovered}. That is a gap in the rulebook, and hiding it would make the plan look
 * complete when it is not.
 */
@Component
public class PlanStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(PlanStage.class);

    private final CheckCatalog catalog;
    private final CaseStore cases;
    private final DocumentTypes docTypes;
    private final Prompts prompts;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;

    public PlanStage(CheckCatalog catalog, CaseStore cases, DocumentTypes docTypes,
                     LlmGateway models, DerivationCache cache, Prompts prompts,
                     ObjectMapper json) {
        this.catalog = catalog;
        this.cases = cases;
        this.docTypes = docTypes;
        this.prompts = prompts;
        this.models = models;
        this.cache = cache;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.PLAN;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("select", "Selecting the rules that apply", this::selectRules),
                Step.<StageContext>of("requirements", "Reading what the credit asks for", this::readRequirements));
    }

    /**
     * The catalogue walk. Instant — no model, no I/O beyond the plan rows.
     *
     * <p>Separate from {@link #readRequirements} because the two cost different amounts and
     * fail for different reasons, and a stage that reported them as one would tell the
     * officer nothing about which was slow.
     */
    private StepResult selectRules(StageContext ctx) {
        Set<String> present = docTypesOnCase(ctx);

        int ordinal = 1;
        int planned = 0;
        for (CheckCatalog.CheckCard card : catalog.activeChecks()) {
            if (card.isGate()) continue;   // already run, already recorded

            // A trigger that is not met records SKIPPED with a reason. "We did not check
            // that" is an answer an examiner has to be able to give, so it is never a
            // silent omission.
            boolean applies = card.docTypes().isEmpty() || present.stream().anyMatch(card.docTypes()::contains);
            String because = applies
                    ? (card.docTypes().isEmpty() ? "Applies to every presentation"
                        : "The presentation includes " + String.join(", ",
                                card.docTypes().stream().map(docTypes::label).toList()))
                    : "Not run — this presentation has no " + String.join(" or ",
                            card.docTypes().stream().map(docTypes::label).toList());

            cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                    "id", card.id(), "origin", Origin.DICTIONARY.name(), "tier", card.tier(),
                    "checkType", card.checkType(), "gate", false,
                    "citedAs", card.citedAs() == null ? "practice" : card.citedAs(),
                    "areaId", applies ? area(card) : null,
                    "name", card.title(), "appliesBecause", because,
                    "ruleRef", String.join(", ", card.refs()),
                    "severity", card.severity(), "refs", card.refs(),
                    "ruleDef", card.rule(),
                    "status", applies ? "PLANNED" : "SKIPPED", "ordinal", ordinal++));
            if (applies) planned++;
        }
        return StepResult.ok(Map.of("ruleCards", planned, "nextOrdinal", ordinal));
    }

    /** What the credit itself demands, read out of {@code :46A:} and {@code :47A:}. */
    private StepResult readRequirements(StageContext ctx) {
        int ordinal = ctx.stepResult(StageId.PLAN, "select")
                .map(r -> r.get("nextOrdinal") instanceof Number n ? n.intValue() : 1)
                .orElse(1);

        int requirements = planRequirements(ctx, ordinal);
        return StepResult.done(requirements + " requirement cards read",
                Map.of("requirementCards", requirements));
    }

    private int planRequirements(StageContext ctx, int ordinal) {
        Optional<Map<String, Object>> parsed = cases.stepResult(ctx.caseId(), StageId.INTAKE.key(), IntakeStage.CREDIT);
        if (parsed.isEmpty()) return 0;

        @SuppressWarnings("unchecked")
        Map<String, Object> credit = (Map<String, Object>) parsed.get().getOrDefault("credit", Map.of());
        String docs = String.valueOf(credit.getOrDefault("documents_required", ""));
        String conditions = String.valueOf(credit.getOrDefault("additional_conditions", ""));
        if (docs.isBlank() && conditions.isBlank()) return 0;

        String prompt = prompts.fill("plan-requirements", Map.of(
                "documentsRequired", docs, "additionalConditions", conditions,
                // The vocabulary, so a requirement names a document the way the rest of the
                // system does. Asked for free text, the planner writes "certificate of
                // origin" and nothing downstream can join it to COO.
                "docCodes", docTypes.vocabulary()));
        var key = new DerivationKey(CacheOp.PLAN_REQUIREMENTS, CacheOp.PLAN_REQUIREMENTS_V,
                DerivationKey.sha256Hex(docs + "|" + conditions), "46A+47A",
                DerivationKey.sha256Hex(prompt), "role:plan", null, Map.of());

        List<Map<String, Object>> found;
        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                var result = models.complete(TextRequest.json(LlmRole.PLAN, prompts.get("plan-system"), prompt));
                return new DerivationCache.Entry<>(parse(result.content()), null,
                        result.rawResponse(), ModelSpend.of(result.usage(), result.model()));
            });
            found = readList(hit.value());
        } catch (RuntimeException e) {
            // The plan is still usable without the credit's own conditions — the dictionary
            // rules stand. Recorded so the officer knows a part of it is missing.
            log.warn("Requirement extraction failed for {}: {}", ctx.caseId(), e.toString());
            ctx.recordFailedStep("requirements", e.getMessage());
            return 0;
        }

        int n = 0;
        Map<String, Set<String>> attest = new LinkedHashMap<>();
        for (Map<String, Object> r : found) {
            demanded(r, attest);
            String id = "REQ-" + String.format("%02d", n + 1);
            cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                    "id", id, "origin", Origin.CREDIT.name(), "tier", "JUDGED", "checkType", "AGENT",
                    "gate", false, "citedAs", "credit", "areaId", "credit",
                    "name", String.valueOf(r.getOrDefault("requirement", "Condition")),
                    "appliesBecause", "Read from " + r.getOrDefault("source", ":47A:") + " of this credit",
                    "ruleRef", String.valueOf(r.getOrDefault("source", ":47A:")),
                    "severity", String.valueOf(r.getOrDefault("severity", "MAJOR")),
                    "refs", List.of(), "plannedByLlm", true,
                    "notCovered", Boolean.TRUE.equals(r.get("notCovered")),
                    "executionPlan", String.valueOf(r.getOrDefault("howToCheck", "")),
                    "status", "PLANNED", "ordinal", ordinal + n));
            n++;
        }
        // Which documents the credit — not UCP — wants looked at rather than merely read.
        // Kept on the step rather than on each card because it is one question per case
        // ("which scans still need a second look"), and the examination asks it once.
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("found", n);
        // Written even when empty. Absent and empty look identical on the step tape, and
        // they are different: "the credit demanded nothing beyond UCP" versus "the planner
        // was not asked". Only one of those is worth investigating.
        Map<String, Object> byDoc = new LinkedHashMap<>();
        attest.forEach((doc, props) -> byDoc.put(doc, List.copyOf(props)));
        result.put("attest", byDoc);
        ctx.recordStep("requirements", result);
        log.info("Credit demands attestation on {} document(s) beyond UCP: {}",
                byDoc.size(), byDoc);
        return n;
    }

    /**
     * The attestations one requirement demands, folded onto the documents it names.
     *
     * <p>"Certificate of origin signed and stamped by the chamber of commerce" is in
     * {@code :46A:}; UCP 600 says nothing about whether a certificate of origin is signed,
     * so no dictionary binding covers it and the reading never looked. This is how that
     * demand becomes a second look at exactly the one document, and no others.
     *
     * <p>An unknown document code is dropped rather than carried. The planner is given the
     * vocabulary and usually obeys it; the one time it invents a code, a look at a document
     * that does not exist would be a call that fails rather than a look that finds nothing.
     */
    private void demanded(Map<String, Object> requirement, Map<String, Set<String>> into) {
        List<String> docs = strings(requirement.get("documents"));
        List<String> props = strings(requirement.get("attestations"));
        if (docs.isEmpty() || props.isEmpty()) return;
        for (String doc : docs) {
            if (!docTypes.known(doc)) {
                // Logged rather than dropped in silence. A planner that answers "Commercial
                // invoice" where INV was asked for produces no second look and no complaint,
                // and the credit's own demand goes unexamined with nothing to show for it.
                log.warn("Requirement names document '{}', which is not in the vocabulary — "
                        + "no attestation will be read for it", doc);
                continue;
            }
            into.computeIfAbsent(doc, k -> new LinkedHashSet<>()).addAll(props);
        }
    }

    private static List<String> strings(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            if (o == null) continue;
            String s = String.valueOf(o).strip();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    /**
     * Every document type this case holds — the credit included.
     *
     * <p>The credit used to be excluded, which was defensible while it was filed under a code
     * of its own and "present" meant "presented by the beneficiary". Now that it is a
     * document type like any other, a check declaring it reads the credit was being told the
     * credit was not there: {@code COND-47A}, whose whole subject is {@code :47A:}, skipped
     * itself on every case with "the credit does not call for LC".
     *
     * <p>What the trigger asks is not "what did the beneficiary present" but "are the
     * documents this check reads available to read".
     */
    private Set<String> docTypesOnCase(StageContext ctx) {
        Set<String> out = new LinkedHashSet<>();
        for (ReadRows.Document d : cases.documents(ctx.caseId())) out.add(d.docCode());
        return out;
    }

    // Areas group checks so the UI can report progress per group rather than per check.
    private String area(CheckCatalog.CheckCard card) {
        String d = card.domain() == null ? "" : card.domain().toLowerCase();
        if (d.contains("time") || d.contains("expiry")) return "a1";
        if (d.contains("transport") || d.contains("shipment")) return "a2";
        if (d.contains("amount") || d.contains("invoice")) return "a3";
        if (d.contains("insurance")) return "a4";
        return "a5";
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String content) {
        try {
            return json.readValue(content, Map.class);
        } catch (Exception e) {
            return Map.of("requirements", List.of());
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readList(Object value) {
        if (value instanceof Map<?, ?> m && m.get("requirements") instanceof List<?> l) {
            return (List<Map<String, Object>>) l;
        }
        return List.of();
    }



}
