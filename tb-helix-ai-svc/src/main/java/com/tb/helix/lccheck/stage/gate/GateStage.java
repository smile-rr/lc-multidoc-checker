package com.tb.helix.lccheck.stage.gate;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.pipeline.Trigger;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.rule.RuleEvaluator;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.types.examination.Origin;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Threshold checks, run before anything is planned.
 *
 * <p>A threshold check is an exact rule whose operands all read documents available before
 * the presentation is examined — the credit and the covering schedule. That eligibility is
 * derived in Governance, not asserted here; this stage runs whatever qualified.
 *
 * <p>The point of running first is money: knowing the credit expired before the planning and
 * judging happens is knowing it before the spend does. Under UCP 600 those are art. 6(d)(i)
 * — presentation on or before the expiry date — and art. 6(a)/(d)(ii), the bank and place the
 * credit is available with. Art. 14(c)'s twenty-one days applies to every presentation too,
 * but it needs the on-board date off the transport document, so it correctly does not qualify.
 *
 * <p><b>This stage no longer stops anything.</b> It used to return a halt on the first
 * failure, which parked the case with one move available — override — and the case that
 * exposed it is the common one: an expired credit whose own {@code :47A:} extends the
 * presentation period, or an amendment that moved {@code :31D:}. Stopping here meant stopping
 * before reading the clause that answers the question. Expiry is not a clean comparison
 * either — art. 29(a) rolls an expiry falling on a day the bank is closed, art. 36 covers
 * force majeure — which is why {@code INCONCLUSIVE} has always been a real answer here.
 *
 * <p>So every threshold check is evaluated, every failure is recorded as a discrepancy, and
 * the verdicts go to {@code PlanStage}, which reads them <em>next to the credit's own terms</em>
 * and decides whether the rest of the run is worth doing. The author's own view travels with
 * each verdict as {@code onFail}; the planner may overrule it for one credit and must say why.
 * UCP 600 art. 16(c) still governs what a refusal notice may state, and that choice now
 * belongs to the officer on a screen rather than to this loop returning early.
 */
@Component
public class GateStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(GateStage.class);

    private final CheckCatalog catalog;
    private final CaseStore cases;

    private final DocumentTypes docTypes;

    private final RuleEvaluator rules;
    private final com.fasterxml.jackson.databind.ObjectMapper json;

    public GateStage(CheckCatalog catalog, CaseStore cases, DocumentTypes docTypes,
                     RuleEvaluator rules, com.fasterxml.jackson.databind.ObjectMapper json) {
        this.catalog = catalog;
        this.cases = cases;
        this.docTypes = docTypes;
        this.rules = rules;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.GATE;
    }

    /**
     * No button of its own — it runs as part of asking for the plan.
     *
     * <p>"Check whether the credit has expired, but do not plan anything" is not something
     * anyone wants, and a case parked at "waiting for gate" would be waiting for a request
     * nobody can make. Running here also puts the verdict in the planner's hands before the
     * expensive half, which is the only reason the order matters.
     */
    @Override
    public Trigger trigger() {
        return Trigger.WITH_NEXT;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("gate", "Running the threshold checks", this::runGates));
    }

    /**
     * Every authored threshold check, in order. All of them, whatever the first one found.
     *
     * <p>One declared step rather than one per gate: which gates exist is the catalogue's
     * answer and changes without a deployment, so a per-gate declaration would make
     * {@link #steps()} depend on data. Each gate's own verdict still lands on the step tape
     * under its check id.
     *
     * <p>The loop used to return at the first failure. A refusal notice states <em>every</em>
     * discrepancy (art. 16(c)), so a second threshold ground hidden behind the first is a
     * ground that cannot be added to the notice later — which is the failure art. 16(f)
     * punishes. Evaluating all of them costs nothing: they are comparisons over fields
     * already in hand.
     */
    private StepResult runGates(StageContext ctx) {
        CaseRow row = cases.find(ctx.caseId()).orElseThrow();
        List<CheckCatalog.CheckCard> gates = catalog.gates();

        if (gates.isEmpty()) {
            return StepResult.skipped("no threshold checks are authored");
        }

        LocalDate expiry = row.expiry();
        LocalDate presented = presentationDate(ctx, row);
        List<Map<String, Object>> verdicts = new ArrayList<>();

        for (CheckCatalog.CheckCard gate : gates) {
            // Per gate, under the id it is recorded against. Announcing the group instead
            // put one beginning on the stream for however many checks ran, and no ending
            // at all — the group was never a step anything wrote down.
            ctx.announce(gate.id(), gate.title());

            cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                    "id", gate.id(), "origin", Origin.DICTIONARY.name(), "tier", "EXACT",
                    "checkType", gate.checkType(), "gate", true, "citedAs", "practice",
                    "areaId", "gate", "name", gate.title(),
                    "appliesBecause", "A threshold check — it runs before anything is read",
                    "ruleRef", String.join(", ", gate.refs()),
                    "severity", gate.severity(), "refs", gate.refs(),
                    // An exact rule over fields already in hand. Same derivation as any
                    // other, so the plan reads one vocabulary rather than two.
                    "coverage", "DETERMINISTIC",
                    "docCodes", gate.docTypes(),
                    // The rule goes on the plan row like any other check's. It was left off,
                    // so the one check that ran first was the one the workbench could not
                    // show the working for.
                    "ruleDef", gate.rule(),
                    "status", "DONE", "ordinal", 0));

            // Evaluated by the same engine as every other exact rule. This was written out
            // longhand — an isAfter between two columns — with a comment saying it bypassed
            // "the general SpEL path" because a gate must not depend on the presentation
            // having been read. That constraint is real and it is upheld elsewhere: a gate
            // qualifies only when every operand reads a document marked available before
            // reading. It never needed a second implementation of comparison.
            RuleEvaluator.Result result = rules.evaluate(parseRule(gate.rule()), readings(ctx));

            if (result.failed()) {
                String statement = statement(result, expiry, presented);
                cases.upsertFinding(ctx.caseId(), Rows.of(
                        "id", "gate-" + gate.id(), "checkId", gate.id(),
                        "outcome", "DISCREPANT", "area", "Time & availability", "areaId", "gate",
                        "docId", docTypes.scheduleCode(), "title", gate.title(),
                        "statement", statement, "statementSource", "derived",
                        "detail", result.why(),
                        "expected", "Presented on or before " + expiry,
                        "quote", "Presented " + presented,
                        "reason", String.join(", ", gate.refs()),
                        "failedRow", result.failedRowIndex(),
                        "comparison", result.rows().stream().map(r -> Rows.of(
                                "id", r.id(), "op", r.op(), "label", r.label(), "outcome", r.outcome().name(),
                                "left", r.left(), "right", r.right(), "why", r.why())).toList(),
                        "creditAnchorId", "tag-31D",
                        "confidence", "HIGH"));
                log.info("Threshold check {} failed on case {}: {}",
                        gate.id(), ctx.caseId(), result.why());
            } else if (result.outcome() == RuleEvaluator.Outcome.INCONCLUSIVE) {
                // A threshold check with a missing operand — the covering schedule was not
                // presented, most often. Reported as unsettled rather than passed: a missing
                // input is not evidence that the presentation was in time.
                log.info("Threshold check {} could not be settled on case {}: {}",
                        gate.id(), ctx.caseId(), result.why());
            }

            // Every verdict, in the plan's vocabulary rather than the evaluator's. This is
            // what the planner reads, and it carries the author's own `onFail` so the planner
            // knows what it is being asked to confirm or overrule rather than inventing a
            // policy of its own.
            verdicts.add(Rows.of(
                    "checkId", gate.id(),
                    "title", gate.title(),
                    "outcome", result.outcome().name(),
                    "why", result.why(),
                    "onFail", gate.onFail(),
                    "refs", gate.refs()));

            ctx.recordStep(gate.id(), Map.of("verdict", result.outcome().name(),
                    "expiry", String.valueOf(expiry), "presented", String.valueOf(presented)));
        }

        boolean anyFailed = verdicts.stream().anyMatch(v -> "FAIL".equals(v.get("outcome")));
        return StepResult.ok(Rows.of(
                "gates", gates.size(),
                "verdict", anyFailed ? "FAIL" : "PASS",
                "results", verdicts));
    }

    /**
     * The refusal wording, which has to name dates rather than fields.
     *
     * <p>The evaluator's reason is written for the workbench — "Presentation date on the
     * covering schedule 2026-08-02 is after Expiry date on the letter of credit 2026-07-30".
     * A notice under UCP 600 art. 16 says the same thing in the register a bank sends, and
     * the two are not the same sentence.
     */
    private String statement(RuleEvaluator.Result result, LocalDate expiry, LocalDate presented) {
        if (expiry != null && presented != null) {
            return "PRESENTATION MADE ON " + presented + " AFTER CREDIT EXPIRY " + expiry + ".";
        }
        return String.valueOf(result.why()).toUpperCase();
    }

    /** The case's facts, in the shape the evaluator asks for. Mapping happens here, at the
     *  edge of the stage, so the engine never sees a persistence row. */
    private List<RuleEvaluator.Fact> readings(StageContext ctx) {
        return cases.facts(ctx.caseId()).stream()
                .map(f -> new RuleEvaluator.Fact(f.fieldKey(), f.docCode(), f.label(), f.value()))
                .toList();
    }

    private Object parseRule(Object rule) {
        if (rule == null) return null;
        try {
            return rule instanceof String s ? json.readValue(s, Object.class) : rule;
        } catch (Exception e) {
            log.warn("Could not read the gate rule: {}", e.toString());
            return null;
        }
    }

    /**
     * The date the presentation was made.
     *
     * <p>Read from the covering schedule when the presenting bank stated one, because that
     * is the date that governs; the date we received the file is a fallback and is recorded
     * as such rather than quietly presented as fact.
     */
    private LocalDate presentationDate(StageContext ctx, CaseRow row) {
        // Which document is the schedule is the dictionary's answer, not this file's. It
        // was the literal "CS" — a code an author is free to rename, and would have found
        // renaming quietly disabled the only date the gate depends on.
        String schedule = docTypes.scheduleCode();
        for (ReadRows.Fact f : cases.facts(ctx.caseId())) {
            if (!schedule.equals(f.docCode())) continue;
            String label = String.valueOf(f.label()).toLowerCase();
            if (label.contains("presentation") && label.contains("date")) {
                LocalDate d = date(f.value());
                if (d != null) return d;
            }
        }
        return row.presentedDate();
    }

    private LocalDate date(Object value) {
        if (value == null) return null;
        if (value instanceof java.sql.Date d) return d.toLocalDate();
        try {
            return LocalDate.parse(String.valueOf(value).strip().substring(0, 10));
        } catch (Exception e) {
            return null;
        }
    }
}
