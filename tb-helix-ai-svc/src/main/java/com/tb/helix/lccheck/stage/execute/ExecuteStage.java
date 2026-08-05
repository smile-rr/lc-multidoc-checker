package com.tb.helix.lccheck.stage.execute;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.PromptContext;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.pipeline.FanOut;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.harness.prompt.Prompts;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.rule.RuleEvaluator;
import com.tb.helix.lccheck.service.Comparisons;
import com.tb.helix.lccheck.service.DocumentAttestor;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.service.ModelSpend;
import com.tb.helix.lccheck.types.examination.Areas;
import com.tb.helix.lccheck.types.pipeline.StageId;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

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
    private final Comparisons comparisons;
    private final DocumentAttestor attestor;
    private final Prompts prompts;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;
    private final int concurrency;
    private final int groupSize;
    private final boolean anchors;

    /** Where a domain no authored examiner claims is filed. Never dropped, only noted. */
    private static final String UNCLAIMED = "unclaimed";

    /** What a card read out of this credit answers to, since it belongs to no standing domain. */
    private static final String CREDIT_DOMAIN = "Additional conditions";

    public ExecuteStage(CheckCatalog catalog, CaseStore cases, DocumentTypes docTypes,
                        RuleEvaluator rules, Comparisons comparisons, DocumentAttestor attestor,
                        LlmGateway models, DerivationCache cache, Prompts prompts,
                        ObjectMapper json,
                        @Value("${helix.check.execute.concurrency:3}") int concurrency,
                        @Value("${helix.check.execute.group-size:8}") int groupSize,
                        @Value("${helix.check.execute.anchors:true}") boolean anchors) {
        this.concurrency = concurrency;
        this.groupSize = Math.max(1, groupSize);
        this.anchors = anchors;
        this.catalog = catalog;
        this.cases = cases;
        this.docTypes = docTypes;
        this.rules = rules;
        this.comparisons = comparisons;
        this.attestor = attestor;
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
                Step.<StageContext>of("attest", "Looking again where the credit asks", this::attestOnDemand),
                Step.<StageContext>of("facts", "Assembling what the documents say", this::assembleFacts),
                Step.<StageContext>of("checks", "Running the planned checks", this::runChecks));
    }

    /**
     * A second look at the documents the credit — not UCP — asked to be executed a certain way.
     *
     * <p>The reading attests what the dictionary binds, which is what UCP demands on its own:
     * a transport document signed with capacity, an insurance document signed by an insurer.
     * It cannot attest what <em>this</em> credit demands, because {@code :46A:} and
     * {@code :47A:} have not been read at that point. "Certificate of origin signed and
     * stamped by the chamber of commerce" is that case, and it is common.
     *
     * <p>Runs before the fact sheet is assembled, so what it finds is in front of every check
     * rather than one stage late. A document the reading already attested produces the same
     * derivation key here, so it is a cache hit and not a second bill.
     */
    @SuppressWarnings("unchecked")
    private StepResult attestOnDemand(StageContext ctx) {
        Map<String, Object> planned = cases.stepResult(ctx.caseId(), StageId.PLAN.key(), "requirements")
                .orElse(Map.of());
        if (!(planned.get("attest") instanceof Map<?, ?> demand) || demand.isEmpty()) {
            return StepResult.ok(Map.of("documents", 0));
        }

        String pdfSha = cases.find(ctx.caseId()).orElseThrow().bundlePdfSha();
        if (pdfSha == null) return StepResult.ok(Map.of("documents", 0));

        // Only documents actually presented. A credit demanding a signed inspection
        // certificate that nobody presented is a missing-document discrepancy, raised by the
        // check that looks for it — not a reason to render pages that are not there.
        Map<String, List<Integer>> pages = new LinkedHashMap<>();
        for (var p : cases.bundlePages(ctx.caseId())) {
            if (demand.containsKey(p.docCode())) {
                pages.computeIfAbsent(p.docCode(), k -> new ArrayList<>()).add(p.pageNo());
            }
        }

        int looked = 0;
        for (var entry : pages.entrySet()) {
            if (ctx.cancelled()) break;
            String code = entry.getKey();
            List<Integer> docPages = entry.getValue().stream().sorted().toList();
            ctx.announce("attest:" + code, "The credit asks about the "
                    + docTypes.label(code).toLowerCase());
            try {
                var result = attestor.attest(ctx.caseId(), pdfSha, code, docPages);
                looked++;
                Map<String, Object> what = new LinkedHashMap<>(Map.of(
                        "pages", docPages, "marks", result.marks(),
                        "because", String.valueOf(demand.get(code))));
                if (result.cached()) {
                    ctx.recordCachedStep("attest:" + code, what, null, true);
                } else {
                    ctx.recordStep("attest:" + code, what, true);
                }
            } catch (RuntimeException e) {
                // One document that could not be looked at must not stop the examination.
                log.warn("On-demand attestation failed for {} on case {}: {}",
                        code, ctx.caseId(), e.toString());
                ctx.recordFailedStep("attest:" + code, e.getMessage());
            }
        }
        // Same reason as the gate and the catalogue walk: this wrote marks onto documents,
        // so it says so, so the browser refetches and the officer sees them.
        return looked == 0
                ? StepResult.ok(Map.of("documents", 0))
                : StepResult.done("looked again at " + looked
                        + (looked == 1 ? " document" : " documents"), Map.of("documents", looked));
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
     * Every planned check, settled by whoever can settle it most cheaply.
     *
     * <p>Two passes, and the split is the whole design:
     *
     * <ol>
     *   <li><b>What costs nothing</b> — exact comparisons, and the cards the plan already
     *       routed to a person. Evaluated here, in plan order, no model, no network.
     *   <li><b>What needs reading</b> — grouped by the examiner whose remit it falls in, and
     *       <em>one call per examiner</em> rather than one per check.
     * </ol>
     *
     * <p>The second used to be one model call per judged check, each carrying the whole
     * presentation. Twenty judged cards was twenty calls and twenty copies of the same fact
     * sheet. Grouping is not only cheaper: a domain's checks corroborate each other — expiry,
     * latest shipment and presentation period are one question asked three ways — and an
     * examiner shown all three at once is closer to the person this is standing in for than
     * three examiners each shown a third of it.
     *
     * <p>Areas still open and close, because the review screen fills in area by area. They
     * are counted down rather than looped over, since a group can span two and the fan-out
     * finishes them out of order.
     */
    private StepResult runChecks(StageContext ctx) {
        List<ReadRows.PlanCheck> plan = cases.planChecks(ctx.caseId()).stream()
                .filter(c -> "PLANNED".equals(c.status()))
                .toList();
        if (plan.isEmpty()) return StepResult.ok(Map.of("checks", 0, "findings", 0));

        String factSheet = factSheet(ctx);
        String factDigest = DerivationKey.sha256Hex(factSheet);

        // Read once for the whole stage. Every exact check compares against the same
        // presentation, and fetching it per check was a query per check for a list that
        // cannot change while the stage runs.
        List<RuleEvaluator.Fact> facts = readings(ctx);
        // What the bundle actually holds. Without it a rule that read nothing cannot say
        // whether the document was missing or our reading was, and those are different
        // people's problems.
        Set<String> presented = presented(ctx);

        AreaTally open = new AreaTally(ctx, plan);
        AtomicInteger raised = new AtomicInteger();

        // --- what costs nothing ------------------------------------------------
        List<ReadRows.PlanCheck> judged = new ArrayList<>();
        for (ReadRows.PlanCheck check : plan) {
            if (ctx.cancelled()) {
                open.closeAll();
                return tally(plan, raised);
            }
            // Evaluated once, here, and the result carried. Asking "does this need a model"
            // by running the rule and then running it again to record the answer is two
            // walks of the same tree for one comparison.
            RuleEvaluator.Result settled = exactly(check, facts, presented);
            if (settled == null) {
                judged.add(check);
                continue;
            }
            ctx.announce(check.checkId(), check.name());
            run(ctx, check, raised, () -> check.human()
                    ? recordHuman(ctx, check)
                    : recordExact(ctx, check, settled));
            open.done(check);
        }

        // --- what needs reading ------------------------------------------------
        List<Remit> remits = remits(judged);
        if (!remits.isEmpty()) {
            // One group first, alone, then the rest together. Every group's prompt opens with
            // the same fact sheet, so the first call through warms a prefix the others hit —
            // and a provider only has that prefix once a call carrying it has RETURNED.
            // Firing all of them at once would send the same page of facts N times and be
            // billed for it N times, which is the exact mistake the vision path documents.
            askOne(ctx, remits.get(0), factSheet, factDigest, raised, open, presented);
            List<Remit> rest = remits.subList(1, remits.size());
            FanOut.over(rest, concurrency, remit -> {
                if (ctx.cancelled()) return Boolean.FALSE;
                askOne(ctx, remit, factSheet, factDigest, raised, open, presented);
                return Boolean.TRUE;
            });
        }

        open.closeAll();
        return tally(plan, raised);
    }

    private StepResult tally(List<ReadRows.PlanCheck> plan, AtomicInteger raised) {
        int n = raised.get();
        return StepResult.done(n + (n == 1 ? " finding" : " findings"),
                Map.of("checks", plan.size(), "findings", n));
    }

    /**
     * The comparison, where one can settle this without asking anybody.
     *
     * @return what the rule engine found, or null when this needs a model
     */
    private RuleEvaluator.Result exactly(ReadRows.PlanCheck check, List<RuleEvaluator.Fact> facts,
                                         Set<String> presented) {
        // Nothing on the plan settles this one — the planner said so when it wrote the card.
        // Sending it to a model anyway would buy an opinion on a question already routed to a
        // person, and bill for it. There is no comparison to run and none is needed.
        if (check.human()) return EMPTY;
        if (!"EXACT".equals(check.tier()) || check.ruleDef() == null) return null;

        RuleEvaluator.Result result = rules.evaluate(parseRule(check.ruleDef()), facts, presented);

        // A check filed as exact whose condition asks for a reading. The catalogue derives
        // this now — a rule using one of the four judgement operators is JUDGED whatever its
        // author typed — so reaching here means Governance did not, and that is worth
        // knowing rather than papering over.
        //
        // Reported, not rerouted. This used to quietly send it to a model: a card the
        // console drew as "Comparison" produced a model's opinion, and nothing on any screen
        // reconciled the two. Which kind of check something is belongs to the rulebook.
        if (result.needsJudgement()) {
            log.warn("Check {} on case {} is filed as exact but its condition asks for a "
                    + "judgement — it should be an agent check in Governance",
                    check.checkId(), check.tier());
        }
        return result;
    }

    /** Stands in for a card only a person can settle, which has no comparison to report. */
    private static final RuleEvaluator.Result EMPTY = new RuleEvaluator.Result(
            RuleEvaluator.Outcome.INCONCLUSIVE, List.of(), null, null, null);

    /** Runs one check's settlement, keeping a failure to that check. */
    private void run(StageContext ctx, ReadRows.PlanCheck check, AtomicInteger raised,
                     java.util.function.BooleanSupplier work) {
        try {
            if (work.getAsBoolean()) raised.incrementAndGet();
            cases.setCheckStatus(ctx.caseId(), check.checkId(), "DONE");
        } catch (RuntimeException e) {
            // One check that could not run must not lose the other eighteen — but it must be
            // visible, because a check silently skipped reads as a check passed.
            log.warn("Check {} failed on case {}: {}", check.checkId(), ctx.caseId(), e.toString());
            cases.setCheckStatus(ctx.caseId(), check.checkId(), "FAILED");
            ctx.recordFailedStep(check.checkId(), e.getMessage());
        }
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
        // The rule engine's three outcomes and the officer's three words are the same three
        // things, which is the whole point of the vocabulary — no translation, no loss.
        String outcome = switch (result.outcome()) {
            case FAIL -> "DISCREPANT";
            case PASS -> "CLEAN";
            // Not CLEAN. A check that could not be run has not passed, and reporting it as
            // clean is how an examination comes to claim it looked at something it did not.
            case INCONCLUSIVE -> "DOUBT";
        };
        // Which kind of absence, not merely that there was one. A document nobody lodged is
        // the beneficiary's problem and points at a missing-document discrepancy; a document
        // we failed to read is ours, and is the only signal that would get it fixed. Both
        // used to arrive as "UNANSWERABLE".
        String reason = result.outcome() == RuleEvaluator.Outcome.INCONCLUSIVE
                ? switch (result.gap() == null ? RuleEvaluator.Gap.UNPARSEABLE : result.gap()) {
                    case NOT_PRESENTED -> "NOT_PRESENTED";
                    case NOT_EXTRACTED -> "NOT_EXTRACTED";
                    case UNPARSEABLE -> "UNANSWERABLE";
                  }
                : null;

        var failure = result.firstFailure().orElse(null);
        cases.upsertFinding(ctx.caseId(), Rows.of(
                "id", "f-" + checkId.toLowerCase(),
                "checkId", checkId,
                "outcome", outcome,
                "outcomeReason", reason,
                "area", check.name(),
                "areaId", check.areaId(),
                // Straight off the operand. It used to be recovered by searching the row's
                // English label for " on ", which meant the viewer opened the right document
                // only while nobody reworded the sentence.
                "docId", failure == null ? null : failure.left().doc(),
                "title", check.name(),
                // The author's own Raise line, which is the wording this discrepancy is
                // stated in. The generated sentence stays on `detail`, where it explains
                // rather than pronounces.
                "statement", result.failed() ? result.raise() : null,
                "statementSource", "derived",
                "detail", result.why(),
                "expected", failure == null ? null : failure.label(),
                "quote", failure == null ? null : failure.left().value(),
                "reason", check.ruleRef(),
                "failedRow", result.failedRowIndex(),
                // Every row, so the officer sees the whole comparison rather than the one
                // line that broke. This is what an exact check has that a judged one cannot.
                "comparison", comparisons.of(result),
                "confidence", result.outcome() == RuleEvaluator.Outcome.INCONCLUSIVE ? "LOW" : "HIGH"));

        ctx.recordStep(checkId, Map.of("outcome", outcome, "exact", true));
        ctx.emit(HelixEvent.FINDING, Map.of("findingId", "f-" + checkId.toLowerCase(), "outcome", outcome));
        return !"CLEAN".equals(outcome);
    }

    /**
     * A card only the officer can settle, put on the report as the open question it is.
     *
     * <p>{@code DOUBT} with reason {@code HUMAN_ONLY}, and {@code statementSource = planned}:
     * nobody drafted this wording and nothing computed it. The reason matters — this is not a
     * check that ran and could not conclude ({@code UNANSWERABLE}, a field to fix) nor one no
     * rule covers ({@code NO_RULE}, a rule to write). The plan said before the run that only a
     * person could settle it, and that is a third thing to know.
     */
    private boolean recordHuman(StageContext ctx, ReadRows.PlanCheck check) {
        String checkId = check.checkId();
        cases.upsertFinding(ctx.caseId(), Rows.of(
                "id", "f-" + checkId.toLowerCase(),
                "checkId", checkId,
                "outcome", "DOUBT",
                "outcomeReason", "HUMAN_ONLY",
                "area", "This credit's own conditions",
                "areaId", check.areaId(),
                "title", check.name(),
                "statement", null,
                "statementSource", "planned",
                "detail", nz(check.appliesBecause()),
                "reason", nz(check.ruleRef()),
                "confidence", "LOW",
                "analysis", Rows.of("requirement", check.name(),
                        "why", nz(check.appliesBecause()), "options", List.of())));

        ctx.recordStep(checkId, Map.of("outcome", "DOUBT", "settledBy", "the officer"));
        ctx.emit(HelixEvent.FINDING, Map.of("findingId", "f-" + checkId.toLowerCase(), "outcome", "DOUBT"));
        return true;
    }

    /** Every document code this case holds — the credit and the schedule included. */
    private Set<String> presented(StageContext ctx) {
        Set<String> out = new LinkedHashSet<>();
        for (ReadRows.Document d : cases.documents(ctx.caseId())) out.add(d.docCode());
        return out;
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

    // =========================================================================
    // Asking an examiner
    // =========================================================================

    /**
     * One examiner and the checks that fall in their remit.
     *
     * @param agent null where no authored examiner claims the domain — the checks are still
     *              asked, under a plain instruction, because a check nobody claimed is a gap
     *              in the rulebook and not a reason to leave a presentation unexamined
     */
    private record Remit(CheckCatalog.AgentCard agent, String label, List<ReadRows.PlanCheck> checks) {
    }

    /**
     * The judged checks, divided the way a checking desk is divided.
     *
     * <p>By the examiner's remit, not by document type. Half of what an examiner catches is a
     * conflict <em>between</em> documents — one goods description across the invoice, the bill
     * of lading and the credit — so grouping by document cuts those comparisons in half and
     * then has to send the other document anyway.
     *
     * <p>Split at {@code groupSize}, because a group is one answer with one entry per check
     * and a long list is where a model starts skipping entries. A dropped entry is recorded
     * as DOUBT rather than lost, but it is still a question that cost money and was not
     * answered.
     */
    private List<Remit> remits(List<ReadRows.PlanCheck> judged) {
        if (judged.isEmpty()) return List.of();
        List<CheckCatalog.AgentCard> agents = catalog.agents();

        // Both catalogue reads hoisted out of the loop. Resolving a check's domain used to
        // walk `activeChecks()` per check, which is a query per check to answer a question
        // whose answer is the same list every time.
        Map<String, String> domains = new LinkedHashMap<>();
        for (CheckCatalog.CheckCard card : catalog.activeChecks()) domains.put(card.id(), card.domain());

        Map<String, List<ReadRows.PlanCheck>> byAgent = new LinkedHashMap<>();
        Map<String, CheckCatalog.AgentCard> owner = new LinkedHashMap<>();
        for (ReadRows.PlanCheck check : judged) {
            String domain = domainOf(check, domains);
            CheckCatalog.AgentCard agent = agents.stream()
                    .filter(a -> a.claims(domain))
                    .findFirst().orElse(null);
            String key = agent == null ? UNCLAIMED : agent.id();
            byAgent.computeIfAbsent(key, k -> new ArrayList<>()).add(check);
            if (agent != null) owner.put(key, agent);
        }

        List<Remit> out = new ArrayList<>();
        byAgent.forEach((key, checks) -> {
            CheckCatalog.AgentCard agent = owner.get(key);
            if (agent == null) {
                // Logged, not silent. An unclaimed domain means the desk has grown a concern
                // nobody was given, and that is worth someone knowing before it is twenty
                // checks answered by a generic instruction.
                log.info("No authored examiner claims {} — {} check(s) asked unclaimed",
                        checks.stream().map(c -> domainOf(c, domains)).distinct().toList(),
                        checks.size());
            }
            for (int i = 0; i < checks.size(); i += groupSize) {
                List<ReadRows.PlanCheck> batch = checks.subList(i, Math.min(checks.size(), i + groupSize));
                String label = agent == null ? "Examining what is left" : agent.name();
                out.add(new Remit(agent, label, batch));
            }
        });
        return out;
    }

    /** The domain a check belongs to, which is how an examiner is found for it. */
    private String domainOf(ReadRows.PlanCheck check, Map<String, String> domains) {
        // A requirement read out of this credit belongs to no standing domain — it is not a
        // subject anybody files checks under. It goes to whoever holds the credit's own
        // conditions, which is what `Areas.CREDIT` already says about it.
        if (Areas.CREDIT.equals(check.areaId())) {
            return CREDIT_DOMAIN;
        }
        return domains.get(check.checkId());
    }

    /**
     * One examiner, one call, one answer per check.
     *
     * <p><b>Ordering is the whole performance story.</b> Four layers, from the least likely to
     * change to the most, so each one rides the prefix the layer above it warmed:
     *
     * <ol>
     *   <li><b>How to answer</b> — identical on every call this deployment will ever make.
     *   <li><b>The presentation</b> — identical for every examiner on this case, which is
     *       what makes grouping pay twice: fewer calls, and the biggest block shared by all
     *       of them.
     *   <li><b>The remit</b> — this examiner's instruction and the articles they answer to.
     *   <li><b>The checks</b> — the only part that differs between one call and the next.
     * </ol>
     *
     * <p>Written the way a person would write it — "check these, here is the presentation" —
     * every call differs from the last at character one, a provider's prefix cache matches
     * nothing, and each pays full price for the same page of facts.
     */
    private void askOne(StageContext ctx, Remit remit, String factSheet, String factDigest,
                        AtomicInteger raised, AreaTally open, Set<String> presented) {
        // The examiner, once — not every check in their remit.
        //
        // Announcing all of them put eight beginnings on the stream in the same instant,
        // then nothing for as long as the call took, then eight endings. On screen that is
        // a label flickering through eight names and going quiet, which reads as a stall
        // rather than as one person reading eight things. One name that stays put for the
        // length of the call is both truer and calmer.
        //
        // The checks are still recorded individually — a step may be written without having
        // been announced, but never the other way round: an announcement nothing ends is a
        // beginning the progress panel waits on for ever.
        String key = "checks:" + (remit.agent() == null ? UNCLAIMED : remit.agent().id());
        ctx.announce(key, remit.label());

        Map<String, Map<String, Object>> answers;
        try {
            answers = ask(remit, factSheet, factDigest);
        } catch (RuntimeException e) {
            // The examiner could not be reached. Every check in the group is recorded as
            // failed rather than as clean, and the rest of the plan carries on.
            log.warn("Examiner {} failed on case {}: {}", remit.label(), ctx.caseId(), e.toString());
            for (ReadRows.PlanCheck check : remit.checks()) {
                cases.setCheckStatus(ctx.caseId(), check.checkId(), "FAILED");
                ctx.recordFailedStep(check.checkId(), e.getMessage());
                open.done(check);
            }
            // The announcement above is still open. Ending it is what stops the progress
            // panel showing this examiner as still reading, minutes after they stopped.
            ctx.recordFailedStep(key, e.getMessage());
            return;
        }

        for (ReadRows.PlanCheck check : remit.checks()) {
            // An answer that names no check it belongs to is not evidence about any of them.
            // Absent means DOUBT, never CLEAN — `record` already resolves an unreadable
            // verdict that way, and this hands it one.
            Map<String, Object> answer = answers.getOrDefault(check.checkId(), Map.of());
            if (answer.isEmpty()) {
                log.info("Examiner {} returned nothing for {} on case {}",
                        remit.label(), check.checkId(), ctx.caseId());
            }
            run(ctx, check, raised, () -> record(ctx, check, answer, presented));
            open.done(check);
        }
        ctx.recordStep(key, Map.of(
                "examiner", remit.label(),
                "checks", remit.checks().size(),
                "answered", answers.size()));
    }

    /** The call itself, cached on the facts it read and the checks it was asked. */
    private Map<String, Map<String, Object>> ask(Remit remit, String factSheet, String factDigest) {
        List<String> ids = remit.checks().stream().map(ReadRows.PlanCheck::checkId).sorted().toList();

        PromptContext prompt = PromptContext.create()
                // Identical on every call this deployment will ever make.
                .stable("HOW TO ANSWER", prompts.get("examine-checks"))
                // Identical for every examiner on this case — which is the point.
                .varying("THE PRESENTATION", factSheet)
                .varying("YOUR REMIT", remitOf(remit))
                // The only part that differs call to call, so it goes last.
                .varying("THE CHECKS", describe(remit.checks()));

        var key = new DerivationKey(CacheOp.JUDGE_AGENT, CacheOp.JUDGE_AGENT_V, factDigest,
                (remit.agent() == null ? UNCLAIMED : remit.agent().id()) + ":" + String.join(",", ids),
                prompt.digest(), models.identity(LlmRole.JUDGE), null, Map.of());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            var result = models.complete(TextRequest.json(
                    LlmRole.JUDGE, prompts.get("examine-system"), prompt.render()));
            return new DerivationCache.Entry<>(parse(result.content()), null,
                    result.rawResponse(), ModelSpend.of(result.usage(), result.model()));
        });

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) hit.value();
        return byCheckId(out);
    }

    /** What this examiner is told they are doing, and what they answer to. */
    private String remitOf(Remit remit) {
        CheckCatalog.AgentCard agent = remit.agent();
        StringBuilder sb = new StringBuilder();
        if (agent == null) {
            sb.append("  No standing examiner holds these. Examine them on the presentation "
                    + "and the articles each one cites.\n");
            return sb.toString();
        }
        sb.append("  ").append(agent.name()).append("\n  ").append(nz(agent.behavior())).append('\n');
        if (!anchors || agent.anchors().isEmpty()) return sb.toString();

        // The article itself rather than its number. A model asked to apply "UCP 600 art. 20"
        // is being asked what it remembers; one given the text is being asked to read.
        sb.append("\n  THE ARTICLES THIS REMIT ANSWERS TO\n");
        for (CheckCatalog.AgentCard.Anchor a : agent.anchors()) {
            String text = catalog.articleText(a.ref());
            sb.append("    ").append(a.ref());
            if (a.desc() != null) sb.append(" — ").append(a.desc());
            sb.append('\n');
            if (!text.isBlank()) sb.append("      ").append(text.replace("\n", "\n      ")).append('\n');
        }
        return sb.toString();
    }

    /**
     * The checks, as the examiner is given them.
     *
     * <p>The author's own wording travels with each one. A judged check's body IS the
     * instruction — the catalogue's javadoc has said so since it was written — and it was
     * being dropped between the plan and the run, so the carefully worded reading of
     * {@code :47A:} reached the model as its title and nothing else.
     */
    private String describe(List<ReadRows.PlanCheck> checks) {
        StringBuilder sb = new StringBuilder();
        for (ReadRows.PlanCheck c : checks) {
            sb.append("  ").append(c.checkId()).append(" — ").append(c.name()).append('\n');
            sb.append("    why it is in the plan: ").append(nz(c.appliesBecause())).append('\n');
            sb.append("    authority: ").append(nz(c.ruleRef())).append('\n');
            if (c.executionPlan() != null && !c.executionPlan().isBlank()) {
                sb.append("    how to check it:\n      ")
                  .append(c.executionPlan().strip().replace("\n", "\n      ")).append('\n');
            }
        }
        return sb.toString();
    }

    /**
     * One answer per check, however the examiner arranged them.
     *
     * <p>Two shapes are accepted because both are what a model actually returns when asked
     * for several answers: a list under {@code findings}, and an object keyed by check id.
     * Neither is wrong and insisting on one costs a whole group's answer to a formatting
     * preference.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> byCheckId(Map<String, Object> answer) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        if (answer == null) return out;

        if (answer.get("findings") instanceof List<?> list) {
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Map<String, Object> f = (Map<String, Object>) m;
                Object id = f.get("checkId");
                if (id != null) out.put(String.valueOf(id).strip(), f);
            }
            return out;
        }

        answer.forEach((k, v) -> {
            if (v instanceof Map<?, ?> m) out.put(k.strip(), (Map<String, Object>) m);
        });
        return out;
    }

    // =========================================================================
    // Areas
    // =========================================================================

    /**
     * The areas the review screen fills in, opened at the start and closed as they empty.
     *
     * <p>Named for the counting rather than for the areas, because {@code Areas} is already
     * the vocabulary — one nested class shadowing an imported one is a name a reader has to
     * disambiguate by eye every time they meet it.
     *
     * <p>Counted down rather than looped over, because a group of checks can span two areas
     * and the fan-out finishes them out of order. A loop that emitted AREA_DONE when its own
     * iteration ended would close an area whose other half had not run.
     */
    private static final class AreaTally {

        private final StageContext ctx;
        private final Map<String, AtomicInteger> remaining = new LinkedHashMap<>();

        AreaTally(StageContext ctx, List<ReadRows.PlanCheck> plan) {
            this.ctx = ctx;
            for (ReadRows.PlanCheck c : plan) {
                remaining.computeIfAbsent(areaOf(c), k -> new AtomicInteger()).incrementAndGet();
            }
            remaining.keySet().forEach(a -> ctx.emit(HelixEvent.AREA_STARTED, Map.of("areaId", a)));
        }

        void done(ReadRows.PlanCheck check) {
            AtomicInteger left = remaining.get(areaOf(check));
            if (left != null && left.decrementAndGet() == 0) {
                ctx.emit(HelixEvent.AREA_DONE, Map.of("areaId", areaOf(check)));
            }
        }

        /** Anything still open when the run stops — cancelled, or a group that never returned. */
        void closeAll() {
            remaining.forEach((area, left) -> {
                if (left.getAndSet(0) > 0) ctx.emit(HelixEvent.AREA_DONE, Map.of("areaId", area));
            });
        }

        private static String areaOf(ReadRows.PlanCheck c) {
            return c.areaId() == null ? "a5" : c.areaId();
        }
    }

    /** @return whether this produced something needing attention */
    private boolean record(StageContext ctx, ReadRows.PlanCheck check, Map<String, Object> v,
                           Set<String> presented) {
        String checkId = check.checkId();
        String verdict = String.valueOf(v.getOrDefault("verdict", "inconclusive")).toLowerCase();

        // The agent answers in its own words; this is the only place they are mapped. An
        // answer nothing here recognises is DOUBT, never CLEAN — a reply we could not read
        // is not evidence that the documents complied.
        String outcome = switch (verdict) {
            case "discrepancy", "discrepant", "fail" -> "DISCREPANT";
            case "pass", "clean" -> "CLEAN";
            default -> "DOUBT";
        };
        // An agent formed a view and doubted it, as against one that could not answer at all.
        String reason = "DOUBT".equals(outcome)
                ? (switch (verdict) {
                    case "possible", "doubt", "doubts" -> "LOW_CONFIDENCE";
                    default -> "UNANSWERABLE";
                })
                : null;

        // A clean answer about a document that is not there is not an answer.
        //
        // The instruction tells an examiner to say inconclusive rather than guess, and mostly
        // it does — but "mostly" is not a property to build a refusal on, and the failure is
        // silent and in the dangerous direction: a check declaring it reads the bill of
        // lading, asked about a presentation with no bill of lading, coming back "pass".
        // Nothing was examined and the case reports a clean check.
        //
        // So the plan's own declaration is used as the floor. Only ever downgraded, never up:
        // a DISCREPANT stands, because a missing document may well BE the discrepancy the
        // examiner is naming, and a check whose whole subject is whether the set is complete
        // must be free to say so.
        List<String> absent = check.docCodes().stream()
                .filter(d -> !presented.isEmpty() && !presented.contains(d))
                .toList();
        if ("CLEAN".equals(outcome) && !absent.isEmpty()) {
            log.info("Check {} on case {} came back clean about {}, which was not presented — "
                    + "recording doubt", checkId, ctx.caseId(), absent);
            outcome = "DOUBT";
            reason = "NOT_PRESENTED";
            v = new LinkedHashMap<>(v);
            v.put("why", "Reported as satisfied, but " + String.join(", ", absent)
                    + " was not presented — so nothing was examined against it. "
                    + nz(String.valueOf(v.getOrDefault("why", ""))));
        }

        cases.upsertFinding(ctx.caseId(), Rows.of(
                "id", "f-" + checkId.toLowerCase(),
                "checkId", checkId,
                "outcome", outcome,
                "outcomeReason", reason,
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

        ctx.recordStep(checkId, Map.of("outcome", outcome));
        ctx.emit(HelixEvent.FINDING, Map.of("findingId", "f-" + checkId.toLowerCase(), "outcome", outcome));
        return !"CLEAN".equals(outcome);
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

        appendMarks(sb, ctx);
        return sb.toString();
    }

    /**
     * What is on the documents that is not text.
     *
     * <p>The attestation <em>values</em> are already above, among the facts, because that is
     * what an exact rule joins on. This is the evidence behind them, and a judged check needs
     * it: "the bill of lading is unsigned" and "the bill of lading carries an illegible
     * signature" are settled the same way by a boolean and differently by an examiner.
     *
     * <p>Named as marks rather than folded into the fact list because a document has several
     * and a fact has one value. Flattening them into facts would have collided on the key.
     */
    private void appendMarks(StringBuilder sb, StageContext ctx) {
        List<ReadRows.Mark> marks = cases.marks(ctx.caseId());
        if (marks.isEmpty()) return;

        sb.append("\nSIGNATURES, SEALS AND MARKS\n");
        sb.append("  Read from the page rather than from its text. A mark recorded as "
                + "illegible is present and unreadable, which is not the same as absent.\n");
        String current = null;
        for (ReadRows.Mark m : marks) {
            if (!m.docCode().equals(current)) {
                sb.append("  ").append(docTypes.label(m.docCode()))
                        .append(" (").append(m.docCode()).append(")\n");
                current = m.docCode();
            }
            sb.append("    ").append(m.kind());
            if (m.medium() != null) sb.append(", ").append(m.medium());
            sb.append(": ").append(m.legible() && m.readsAs() != null ? m.readsAs() : "[illegible]");
            if (m.party() != null) sb.append("   party: ").append(m.party());
            if (m.capacity() != null) sb.append("   capacity: ").append(m.capacity());
            if (m.authenticates() != null) sb.append("   authenticates: ").append(m.authenticates());
            if (m.placement() != null) sb.append("   (").append(m.placement()).append(')');
            if (m.page() != null) sb.append("   [p.").append(m.page()).append(']');
            sb.append('\n');
        }
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
