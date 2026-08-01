package com.tb.helix.lccheck.stage.plan;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.PromptContext;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.prompt.Prompts;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.lccheck.persistence.CaseRow;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * What this credit demands, which rules answer it, and whether the rest of the run is worth
 * doing.
 *
 * <p>Three steps, and they are separated because they cost different amounts and fail for
 * different reasons — a stage reporting them as one would tell the officer nothing about
 * which was slow or which went wrong.
 *
 * <ol>
 *   <li><b>select</b> — the catalogue walk. Instant, no model. Every standing rule whose
 *       trigger this presentation meets.
 *   <li><b>requirements</b> — one model call reading {@code :46A:} and {@code :47A:}, and
 *       <em>compiling</em> what it can into conditions the examination settles for free.
 *   <li><b>govern</b> — one model call, reasoning on, that weighs the threshold verdicts and
 *       the credit's own terms against everything the first two produced.
 * </ol>
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
 * <p><b>Why the governing step exists.</b> {@code :47A:} is where a credit says things that
 * change what the rest of the rulebook means — charges are the beneficiary's, a stated
 * discrepancy is acceptable, the presentation period is extended, UCP is excluded in some
 * particular. A plan assembled by trigger-matching alone cannot see any of it, so it runs
 * rules the credit has already answered and stops on grounds the credit has already excused.
 * That step also holds the one decision worth a reasoning model: given that a threshold check
 * failed, is examining the other twenty rules work or waste.
 *
 * <p><b>What it may not do is drop a rule quietly.</b> A suppression writes the clause that
 * caused it onto the row <em>and</em> raises a card for a person to confirm it — so setting a
 * standing rule aside always costs the officer a look, which is the only reason it is safe to
 * let a model do it at all.
 */
@Component
public class PlanStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(PlanStage.class);

    private static final String GOVERN = "govern";

    private final CheckCatalog catalog;
    private final CaseStore cases;
    private final DocumentTypes docTypes;
    private final RuleCompiler rules;
    private final Prompts prompts;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;
    private final boolean thinking;

    public PlanStage(CheckCatalog catalog, CaseStore cases, DocumentTypes docTypes,
                     RuleCompiler rules, LlmGateway models, DerivationCache cache, Prompts prompts,
                     ObjectMapper json,
                     @Value("${helix.check.plan.thinking:true}") boolean thinking) {
        this.catalog = catalog;
        this.cases = cases;
        this.docTypes = docTypes;
        this.rules = rules;
        this.prompts = prompts;
        this.models = models;
        this.cache = cache;
        this.json = json;
        this.thinking = thinking;
    }

    @Override
    public StageId id() {
        return StageId.PLAN;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("select", "Selecting the rules that apply", this::selectRules),
                Step.<StageContext>of("requirements", "Reading what the credit asks for", this::readRequirements),
                Step.<StageContext>of(GOVERN, "Weighing the plan against this credit", this::govern));
    }

    // =========================================================================
    // 1 — the catalogue walk
    // =========================================================================

    /**
     * The catalogue walk. Instant — no model, no I/O beyond the plan rows.
     *
     * <p>Separate from the two model calls because it costs nothing and cannot fail the way
     * they can, and because it is what they are given to reason about.
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
                    "coverage", coverage(card.tier()),
                    // What it looks at, as the author declared it. Written down rather
                    // than derived, because for a judged card there is no rule to derive
                    // it from and the plan screen has a column for it either way.
                    "docCodes", card.docTypes(),
                    "status", applies ? "PLANNED" : "SKIPPED", "ordinal", ordinal++));
            if (applies) planned++;
        }
        return StepResult.ok(Map.of("ruleCards", planned, "nextOrdinal", ordinal));
    }

    // =========================================================================
    // 2 — the requirement reader
    // =========================================================================

    /** What the credit itself demands, read out of {@code :46A:} and {@code :47A:}. */
    private StepResult readRequirements(StageContext ctx) {
        int ordinal = ctx.stepResult(StageId.PLAN, "select")
                .map(r -> r.get("nextOrdinal") instanceof Number n ? n.intValue() : 1)
                .orElse(1);

        return planRequirements(ctx, ordinal);
    }

    private StepResult planRequirements(StageContext ctx, int ordinal) {
        Map<String, Object> credit = parsedCredit(ctx);
        String docs = String.valueOf(credit.getOrDefault("documents_required", ""));
        String conditions = String.valueOf(credit.getOrDefault("additional_conditions", ""));
        if (docs.isBlank() && conditions.isBlank()) {
            return StepResult.ok(Map.of("found", 0, "attest", Map.of()));
        }

        // Stable before volatile. The three vocabularies and the instruction are byte-
        // identical on every credit this bank will ever examine; only the two tag blocks
        // differ. Written the way a person would write it — this credit, then the rules —
        // every case pays full price for the invariant nine tenths, because a provider's
        // prefix cache matches a *leading* run of bytes and the first volatile character
        // ends it. Same reason the vision path puts images ahead of the instruction.
        PromptContext prompt = PromptContext.create()
                .stable("WHAT TO PRODUCE", prompts.get("plan-requirements"))
                .stable("DOCUMENT TYPE CODES", docTypes.vocabulary())
                .stable("FIELDS THAT CAN BE COMPARED, BY DOCUMENT", rules.vocabulary())
                .stable("OPERATORS A CONDITION MAY USE", rules.operators())
                .varying("FIELD 46A — DOCUMENTS REQUIRED", docs)
                .varying("FIELD 47A — ADDITIONAL CONDITIONS", conditions);

        var key = new DerivationKey(CacheOp.PLAN_REQUIREMENTS, CacheOp.PLAN_REQUIREMENTS_V,
                prompt.volatileDigest(), "46A+47A", prompt.digest(), "role:plan", null, Map.of());

        List<Map<String, Object>> found;
        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                var result = models.complete(TextRequest.json(
                        LlmRole.PLAN, prompts.get("plan-system"), prompt.render()));
                return new DerivationCache.Entry<>(parse(result.content()), null,
                        result.rawResponse(), ModelSpend.of(result.usage(), result.model()));
            });
            found = readList(hit.value(), "requirements");
        } catch (RuntimeException e) {
            // The plan is still usable without the credit's own conditions — the dictionary
            // rules stand. Recorded so the officer knows a part of it is missing.
            log.warn("Requirement extraction failed for {}: {}", ctx.caseId(), e.toString());
            ctx.recordFailedStep("requirements", e.getMessage());
            return StepResult.ok(Map.of("found", 0, "attest", Map.of()));
        }

        int n = 0;
        int compiled = 0;
        ClauseIds ids = idsFor(ctx);
        Map<String, Set<String>> attest = new LinkedHashMap<>();
        for (Map<String, Object> r : found) {
            demanded(r, attest);
            if (writeRequirement(ctx, ids.mint(str(r.get("source"))), r, ordinal + n)) compiled++;
            n++;
        }

        // Which documents the credit — not UCP — wants looked at rather than merely read.
        // Kept on the step rather than on each card because it is one question per case
        // ("which scans still need a second look"), and the examination asks it once.
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("found", n);
        result.put("compiled", compiled);
        // Written even when empty. Absent and empty look identical on the step tape, and
        // they are different: "the credit demanded nothing beyond UCP" versus "the planner
        // was not asked". Only one of those is worth investigating.
        Map<String, Object> byDoc = new LinkedHashMap<>();
        attest.forEach((doc, props) -> byDoc.put(doc, List.copyOf(props)));
        result.put("attest", byDoc);
        log.info("Credit demands attestation on {} document(s) beyond UCP: {}", byDoc.size(), byDoc);
        return StepResult.done(n + " requirement cards read, " + compiled + " as exact conditions", result);
    }

    /**
     * One requirement, filed at the cheapest tier that can actually settle it.
     *
     * <p>Three outcomes, and the middle one is the point of the whole step: a condition the
     * planner compiled into operands the dictionary knows becomes an <em>exact</em> check and
     * costs nothing to run, for ever, on every case. "Invoice must show the credit number" is
     * that, and it used to be a model call returning an opinion.
     *
     * <p>A rule that does not validate demotes the card rather than the rule — an invented
     * comparison reported as deterministic is the one failure worth engineering against, and
     * the reason it was rejected goes on the row where an author can act on it.
     *
     * @return whether the condition compiled, so the step can report how much of what this
     *         credit demands now costs nothing to check
     */
    private boolean writeRequirement(StageContext ctx, String id, Map<String, Object> r, int ordinal) {
        String source = nz(str(r.get("source"))).isEmpty() ? ":47A:" : str(r.get("source"));
        String what = nz(str(r.get("requirement"))).isEmpty() ? "Condition" : str(r.get("requirement"));
        String howToCheck = nz(str(r.get("howToCheck")));
        String because = "Read from " + source + " of this credit";

        Object groups = null;
        if (r.get("rule") != null) {
            RuleCompiler.Verdict v = rules.compile(r.get("rule"));
            if (v.ok()) {
                groups = v.groups();
            } else {
                log.info("Requirement {} on case {} could not be compiled ({}) — judging it instead",
                        id, ctx.caseId(), v.why());
                because = because + ". Its condition could not be settled by comparison: " + v.why();
            }
        }

        boolean human = groups == null && Boolean.TRUE.equals(r.get("notCovered"));
        String tier = groups != null ? "EXACT" : "JUDGED";

        cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                "id", id, "origin", Origin.CREDIT.name(),
                "tier", tier,
                "checkType", groups != null ? "PROGRAMMATIC" : "AGENT",
                "gate", false, "citedAs", "credit", "areaId", Areas.CREDIT,
                "name", what,
                "appliesBecause", because,
                "ruleRef", source,
                "severity", severity(r.get("severity")),
                "refs", List.of(), "plannedByLlm", true,
                "notCovered", human,
                "ruleDef", groups,
                // Only a judged card has a prompt to assemble. An exact one has its rows,
                // and writing prose beside them invites the two to disagree.
                "executionPlan", groups != null ? null : howToCheck,
                "coverage", human ? "HUMAN" : coverage(tier),
                // Only codes the dictionary knows. The planner is given the vocabulary
                // and usually obeys it; one that invents a code would otherwise put a
                // document that does not exist in front of the officer.
                "docCodes", strings(r.get("documents")).stream().filter(docTypes::known).toList(),
                "status", "PLANNED", "ordinal", ordinal));

        return groups != null;
    }

    // =========================================================================
    // 3 — the governing agent
    // =========================================================================

    /**
     * The plan, weighed against what this credit actually says.
     *
     * <p>The one call in the pipeline that is asked to hold several things at once — a
     * threshold verdict, twenty candidate rules, a page of the applicant's own conditions —
     * and reach a decision rather than transcribe. That is what {@code enable_thinking}
     * is turned on for here and nowhere else.
     */
    private StepResult govern(StageContext ctx) {
        CaseRow row = cases.find(ctx.caseId()).orElseThrow();
        Map<String, Object> credit = parsedCredit(ctx);
        String conditions = String.valueOf(credit.getOrDefault("additional_conditions", ""));
        String required = String.valueOf(credit.getOrDefault("documents_required", ""));
        List<Map<String, Object>> gates = gateVerdicts(ctx);
        List<ReadRows.PlanCheck> plan = cases.planChecks(ctx.caseId());

        // Nothing to weigh: no threshold check had anything to say and the credit imposed no
        // conditions of its own. Deciding that with a reasoning model would be paying for an
        // answer already known.
        if (gates.isEmpty() && conditions.isBlank()) {
            return settle(ctx, decision(gates, true,
                    "No threshold check reported anything and the credit states no additional "
                            + "conditions, so the plan stands as selected.",
                    List.of(), null));
        }

        PromptContext prompt = PromptContext.create()
                .stable("HOW TO DECIDE", prompts.get("plan-govern"))
                .varying("THRESHOLD CHECKS ALREADY RUN", describe(gates))
                .varying("THE CREDIT", creditTerms(row))
                .varying("FIELD 46A — DOCUMENTS REQUIRED", required)
                .varying("FIELD 47A — ADDITIONAL CONDITIONS", conditions)
                .varying("STANDING RULES SELECTED FOR THIS PRESENTATION", describeChecks(plan, false))
                .varying("REQUIREMENTS READ FROM THIS CREDIT", describeChecks(plan, true));

        var key = new DerivationKey(CacheOp.PLAN_GOVERN, CacheOp.PLAN_GOVERN_V,
                prompt.volatileDigest(), "plan", prompt.digest(), "role:plan", null,
                Map.of("thinking", thinking));

        Map<String, Object> verdict;
        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                String system = prompts.get("plan-govern-system");
                var result = models.complete(thinking
                        ? TextRequest.thinking(LlmRole.PLAN, system, prompt.render())
                        : TextRequest.json(LlmRole.PLAN, system, prompt.render()));
                return new DerivationCache.Entry<>(parse(result.content()), null,
                        result.rawResponse(), ModelSpend.of(result.usage(), result.model()));
            });
            verdict = asMap(hit.value());
        } catch (RuntimeException e) {
            // A plan that could not be weighed is still a plan. Everything selected runs,
            // which is the conservative answer: examining a rule the credit had excused
            // costs money, and skipping one it had not costs a discrepancy.
            //
            // Not recorded as a failed step. The engine writes this step's own result when
            // it returns, and it would overwrite the failure a moment later — so the reason
            // goes where it is actually read, which is the sentence on the plan screen.
            log.warn("Plan governance failed for {}: {}", ctx.caseId(), e.toString());
            return settle(ctx, decision(gates, true,
                    "The plan could not be weighed against this credit — " + e.getMessage()
                            + " — so every selected check runs.",
                    List.of(), null));
        }

        return settle(ctx, apply(ctx, gates, verdict));
    }

    /** Carries out what the planner decided, and returns the record of it. */
    private Map<String, Object> apply(StageContext ctx, List<Map<String, Object>> gates,
                                      Map<String, Object> verdict) {
        Set<String> known = cases.planChecks(ctx.caseId()).stream()
                .map(ReadRows.PlanCheck::checkId).collect(java.util.stream.Collectors.toSet());

        List<Map<String, Object>> suppressed = new ArrayList<>();
        ClauseIds ids = idsFor(ctx);
        int n = 0;
        for (Map<String, Object> s : readList(verdict, "suppress")) {
            String checkId = str(s.get("checkId"));
            // A check id nobody planned is a hallucination, and acting on it would suppress
            // nothing while reporting that it had. Logged rather than dropped in silence.
            if (checkId == null || !known.contains(checkId)) {
                log.warn("Plan asked to suppress {} on case {}, which is not in the plan",
                        checkId, ctx.caseId());
                continue;
            }
            String quote = str(s.get("quote"));
            String because = str(s.get("because"));
            String reason = "Set aside for this credit" + (because == null ? "" : ": " + because)
                    + (quote == null ? "" : " — " + quote);
            cases.suppressPlanCheck(ctx.caseId(), checkId, reason);

            // The price of letting a model stand a reviewed rule down: it always costs the
            // officer a look. Nothing here is quiet, and nothing takes the officer's word
            // for granted either — the card says which rule and on whose authority.
            // Anchored on :47A: because that is where the clause standing the rule down
            // was read. The card is about `checkId`, but its authority is the credit's.
            String reviewId = ids.mint(":47A:");
            n++;
            raiseForReview(ctx, reviewId,
                    "Confirm that " + checkId + " does not apply to this credit",
                    reason, ":47A:", 900 + n);
            suppressed.add(Rows.of("checkId", checkId, "because", because, "quote", quote,
                    "confirmBy", reviewId));
        }

        for (Map<String, Object> h : readList(verdict, "humanReview")) {
            String what = str(h.get("requirement"));
            if (what == null) continue;
            String source = str(h.get("source")) == null ? ":47A:" : str(h.get("source"));
            String reviewId = ids.mint(source);
            n++;
            raiseForReview(ctx, reviewId, what, nz(str(h.get("because"))), source, 900 + n);
        }

        Map<String, Object> override = asMap(verdict.get("gateOverride"));
        boolean runRemaining = decideRunRemaining(gates, verdict, override);
        return decision(gates, runRemaining,
                nz(str(verdict.get("why"))), suppressed, override.isEmpty() ? null : override);
    }

    /**
     * Whether the rest of the plan runs.
     *
     * <p>The author's {@code onFail} is the default and the planner may overrule it, because
     * only the credit knows whether its own terms bear on the ground that failed. What the
     * planner may <em>not</em> do is stop a run no threshold check objected to: a model
     * deciding on its own that twenty rules are not worth examining is a model deciding not
     * to examine a presentation, and nothing in this system should let it.
     */
    private boolean decideRunRemaining(List<Map<String, Object>> gates, Map<String, Object> verdict,
                                       Map<String, Object> override) {
        boolean anyStops = gates.stream().anyMatch(g ->
                "FAIL".equals(g.get("outcome")) && "STOP".equals(g.get("onFail")));
        if (!override.isEmpty() && "CONTINUE".equalsIgnoreCase(str(override.get("to")))) return true;
        if (!override.isEmpty() && "STOP".equalsIgnoreCase(str(override.get("to")))) {
            anyStops = gates.stream().anyMatch(g -> "FAIL".equals(g.get("outcome")));
        }
        if (!anyStops) return true;
        Object asked = verdict.get("runRemaining");
        return asked instanceof Boolean b ? b : false;
    }

    /** The record of what was decided, in the shape the case column and the workbench read. */
    private Map<String, Object> decision(List<Map<String, Object>> gates, boolean runRemaining,
                                         String why, List<Map<String, Object>> suppressed,
                                         Map<String, Object> override) {
        boolean failed = gates.stream().anyMatch(g -> "FAIL".equals(g.get("outcome")));
        return Rows.of(
                "gateVerdict", gates.isEmpty() ? "NONE" : failed ? "FAIL" : "PASS",
                "gateCheckIds", gates.stream()
                        .filter(g -> "FAIL".equals(g.get("outcome"))).map(g -> g.get("checkId")).toList(),
                "runRemaining", runRemaining,
                "why", why,
                "suppressed", suppressed,
                "gateOverride", override);
    }

    /**
     * Writes the decision down, and works out where Auto should leave the officer.
     *
     * <p>Counted after everything is written rather than tallied along the way: a suppression
     * and a requirement both raise review cards, and a count kept by hand would be the sort
     * of thing that is right until somebody adds a third way to raise one.
     */
    private StepResult settle(StageContext ctx, Map<String, Object> decision) {
        int human = cases.humanReviewCount(ctx.caseId());
        boolean runRemaining = Boolean.TRUE.equals(decision.get("runRemaining"));
        long remaining = cases.planChecks(ctx.caseId()).stream()
                .filter(c -> "PLANNED".equals(c.status()) && !c.human())
                .count();

        Map<String, Object> full = new LinkedHashMap<>(decision);
        full.put("humanReview", human);
        full.put("remaining", (int) remaining);
        // Auto runs to the decision. It stops at the report only when something in the plan
        // needs a person — which is the whole reason the review screen exists, and the only
        // honest reason to interrupt somebody who asked not to be interrupted.
        //
        // And only when those questions are actually going to be put. A plan that stops after
        // a gate asks none of them, so it lands on the decision: the officer's next act is to
        // refuse on the ground that was found, or to run the rest — not to work through cards
        // nothing has looked at.
        full.put("destination", runRemaining && human > 0 ? "review" : "decision");
        cases.savePlanDecision(ctx.caseId(), full);

        String note = runRemaining
                ? remaining + " checks to run"
                : "stopping here — " + remaining + " checks not run";
        return StepResult.done(note, full);
    }

    /**
     * Ids for the cards the planner writes, anchored on the tag they were read from.
     *
     * <p>The convention is {@code <CONCERN>-<ANCHOR>[.<clause>]} and it is already what the
     * dictionary uses: {@code DATE-31D} is a date check reading tag 31D. A planner card keeps
     * the shape — {@code CR-47A.2} — so it still says which tag it came from, which is
     * self-describing in a way a bare running number is not.
     *
     * <p><b>One prefix and one counter</b>, deliberately. An earlier pass took the concern
     * from the tag, so a plan read {@code DOCSET-46A.1, DOCSET-46A.2, COND-47A.1,
     * DOCSET-46A.3} — two prefixes alternating and each restarting its own numbering, for a
     * set of cards that all came out of the same model call. {@code CR} is every requirement
     * this credit produced, numbered once through: {@code CR-46A.1 … CR-46A.5, CR-47A.6}.
     *
     * <p>It replaces {@code REQ-01}, which was wrong twice over. {@code 01} anchors on
     * nothing, and <b>{@code REQ} is a dictionary concern</b> — the seeded catalogue ships
     * {@code REQ-38} and {@code REQ-41A}. The planner and an author were minting into one
     * namespace with {@code UNIQUE (case_id, check_id)} underneath, so the day somebody
     * authored {@code REQ-01} the planner's upsert would have overwritten their check with
     * a requirement read off a credit, silently.
     *
     * <p>The clause suffix is what keeps the two apart for good: the dictionary owns
     * {@code COND-47A}, the standing check over the whole field; the planner owns
     * {@code COND-47A.1}, {@code .2}, {@code .3}. And every id is checked against what is
     * already on the case before it is used, so a collision is impossible rather than
     * merely unlikely.
     */
    private static final class ClauseIds {

        /** Credit requirement. Not a dictionary concern, so it can never collide with one. */
        private static final String PREFIX = "CR";

        private final Set<String> taken;
        private final Map<String, Integer> seq = new LinkedHashMap<>();

        ClauseIds(Collection<String> alreadyOnTheCase) {
            this.taken = new HashSet<>(alreadyOnTheCase);
        }

        /** @param source the credit tag this card was read from, e.g. {@code :46A:} */
        String mint(String source) {
            String tag = source != null && source.contains("46A") ? "46A" : "47A";
            int n = seq.getOrDefault(PREFIX, 0);
            String id;
            do {
                id = PREFIX + "-" + tag + "." + (++n);
            } while (taken.contains(id));
            seq.put(PREFIX, n);
            taken.add(id);
            return id;
        }
    }

    private ClauseIds idsFor(StageContext ctx) {
        return new ClauseIds(cases.planChecks(ctx.caseId()).stream()
                .map(ReadRows.PlanCheck::checkId).toList());
    }

    // =========================================================================
    // Planning a card only an examiner can settle
    // =========================================================================

    /**
     * Something nothing on the plan tests, put on the plan for a person.
     *
     * <p><b>A plan check, and deliberately not a finding.</b> This wrote both for a while,
     * on the reasoning that a card raised in execute would never appear if the plan decided
     * not to run execute. That has it backwards: if execute never ran, the question genuinely
     * has not been asked, and a report listing it as an open item claims an examination that
     * did not happen. A finding is something the examination produced; a plan check is
     * something it intends to do.
     *
     * <p>What that costs is nothing, because the two things an officer needs live in the two
     * places they belong. The full list — every card, who settles it, and that it did not run
     * — is the plan screen, which is the coverage record and is the screen that answers "did
     * you check X?" in a dispute. The report carries what was found. When the plan stops
     * after a gate, that is the gate's ground and a single line saying how much was not
     * examined, rather than six cards demanding a disposition each on work whose answers
     * could not have changed the outcome.
     *
     * <p>{@link com.tb.helix.lccheck.stage.execute.ExecuteStage} raises the finding when it
     * reaches the card — with no model call, because there is nothing to ask.
     */
    private void raiseForReview(StageContext ctx, String id, String what, String because,
                                String source, int ordinal) {
        cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                "id", id, "origin", Origin.CREDIT.name(), "tier", "JUDGED", "checkType", "AGENT",
                "gate", false, "citedAs", "credit", "areaId", Areas.CREDIT,
                "name", what,
                "appliesBecause", because,
                "ruleRef", source, "severity", "MAJOR", "refs", List.of(),
                "plannedByLlm", true, "notCovered", true,
                "coverage", "HUMAN", "status", "PLANNED", "ordinal", ordinal));
    }

    // =========================================================================
    // Reading the case
    // =========================================================================

    /** What the threshold stage found, or nothing when it was skipped. */
    private List<Map<String, Object>> gateVerdicts(StageContext ctx) {
        return ctx.stepResult(StageId.GATE, "gate")
                .map(r -> readList(r, "results"))
                .orElse(List.of());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parsedCredit(StageContext ctx) {
        return cases.stepResult(ctx.caseId(), StageId.INTAKE.key(), IntakeStage.CREDIT)
                .map(r -> (Map<String, Object>) r.getOrDefault("credit", Map.of()))
                .orElse(Map.of());
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

    // =========================================================================
    // Describing the plan to the model
    // =========================================================================

    private String describe(List<Map<String, Object>> gates) {
        if (gates.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> g : gates) {
            sb.append("  ").append(g.get("checkId")).append(" — ").append(g.get("title"))
              .append("\n    outcome: ").append(g.get("outcome"))
              .append("\n    why: ").append(g.get("why"))
              .append("\n    the author's view of a failure: ").append(g.get("onFail"))
              .append('\n');
        }
        return sb.toString();
    }

    private String describeChecks(List<ReadRows.PlanCheck> plan, boolean fromCredit) {
        StringBuilder sb = new StringBuilder();
        for (ReadRows.PlanCheck c : plan) {
            if (c.isGate()) continue;
            if (!"PLANNED".equals(c.status())) continue;
            if ((Origin.CREDIT.name().equals(c.origin())) != fromCredit) continue;
            sb.append("  ").append(c.checkId()).append(" — ").append(c.name())
              .append(" [").append(c.tier().toLowerCase()).append(", cites ")
              .append(nz(c.ruleRef())).append("]\n");
        }
        return sb.toString();
    }

    /** The terms a decision about this credit turns on. Not the whole case. */
    private String creditTerms(CaseRow c) {
        StringBuilder sb = new StringBuilder();
        term(sb, "credit reference", c.creditRef());
        term(sb, "expiry (:31D:)", c.expiry());
        term(sb, "place of expiry", c.expiryPlace());
        term(sb, "latest shipment (:44C:)", c.latestShipment());
        term(sb, "presentation period, days", c.presentationDays());
        term(sb, "currency and amount (:32B:)",
                c.currency() == null ? null : c.currency() + " " + c.amount());
        term(sb, "presented on", c.presentedDate());
        term(sb, "presented by", c.presentingBank());
        return sb.toString();
    }

    private static void term(StringBuilder sb, String label, Object value) {
        if (value == null || String.valueOf(value).isBlank()) return;
        sb.append("  ").append(label).append(": ").append(value).append('\n');
    }

    // Areas group checks so the UI can report progress per group rather than per check.
    // Asked of the one place that answers it — there used to be a second copy of this
    // mapping here, byte-identical and free to drift.
    private String area(CheckCatalog.CheckCard card) {
        return Areas.forDomain(card.domain());
    }

    /**
     * How well a check can be settled, from the tier that decides it.
     *
     * <p>Derived rather than authored, so it cannot disagree with the thing it describes.
     * {@code HUMAN} is not here because it is not a tier — it is the answer when no check
     * covers the demand at all, which is a property of the plan rather than of a rule.
     */
    private static String coverage(String tier) {
        return "EXACT".equals(tier) ? "DETERMINISTIC" : "SEMI_DETERMINISTIC";
    }

    /**
     * A severity the column will accept, whatever the model wrote.
     *
     * <p>{@code MAJOR} is the fallback rather than {@code MINOR}, on the same principle as
     * an unrecognised check type resolving to a judged one: of the two ways to be wrong about
     * how much a failure matters, under-stating it is the one that reaches an applicant.
     */
    private static String severity(Object value) {
        String s = value == null ? "" : String.valueOf(value).strip().toUpperCase();
        return switch (s) {
            case "CRITICAL", "MAJOR", "MINOR" -> s;
            default -> "MAJOR";
        };
    }

    // =========================================================================
    // JSON
    // =========================================================================

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String content) {
        try {
            return json.readValue(content, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> readList(Object value, String key) {
        if (value instanceof Map<?, ?> m && m.get(key) instanceof List<?> l) {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object o : l) if (o instanceof Map<?, ?> e) out.add((Map<String, Object>) e);
            return out;
        }
        return List.of();
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

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).strip();
        return s.isEmpty() ? null : s;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
