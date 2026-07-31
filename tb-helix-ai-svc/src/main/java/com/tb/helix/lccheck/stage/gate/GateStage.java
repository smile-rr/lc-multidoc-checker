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
import java.util.List;
import java.util.Map;

/**
 * Hard checks, run before anything is planned.
 *
 * <p>A gate is an exact rule whose operands all read documents available before the
 * presentation is examined — the credit and the covering schedule. That eligibility is
 * derived in Governance, not asserted here; this stage runs whatever qualified.
 *
 * <p>The point of running first is money: an expired credit stops the examination before
 * planning and judging, which is where the spend is. The point of stopping is UCP 600
 * art. 16(c) — a refusing bank gives one notice stating every discrepancy, so a refusal on
 * a gate carries that ground alone, and the officer needs to choose it deliberately.
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
     * nobody can make. Running here also puts the halt before the expensive half.
     */
    @Override
    public Trigger trigger() {
        return Trigger.WITH_NEXT;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("gate", "Running the hard checks", this::runGates));
    }

    /**
     * Every authored hard check, in order, stopping at the first that fails.
     *
     * <p>One declared step rather than one per gate: which gates exist is the catalogue's
     * answer and changes without a deployment, so a per-gate declaration would make
     * {@link #steps()} depend on data. Each gate's own verdict still lands on the step tape
     * under its check id.
     */
    private StepResult runGates(StageContext ctx) {
        CaseRow row = cases.find(ctx.caseId()).orElseThrow();
        List<CheckCatalog.CheckCard> gates = catalog.gates();

        // An override is the officer saying "I have seen this ground and I am continuing
        // anyway". The finding stays — it is still a discrepancy and still belongs in the
        // notice — but re-halting on every subsequent run would make the override do
        // nothing, which is how a case becomes impossible to move.
        if (row.gateOverriddenBy() != null) {
            return StepResult.skipped("overridden by " + row.gateOverriddenBy()
                    + " on " + row.gateHaltCheckId());
        }
        if (gates.isEmpty()) {
            return StepResult.skipped("no hard checks are authored");
        }

        LocalDate expiry = row.expiry();
        LocalDate presented = presentationDate(ctx, row);

        for (CheckCatalog.CheckCard gate : gates) {
            // Per gate, under the id it is recorded against. Announcing the group instead
            // put one beginning on the stream for however many checks ran, and no ending
            // at all — the group was never a step anything wrote down.
            ctx.announce(gate.id(), gate.title());

            cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                    "id", gate.id(), "origin", Origin.DICTIONARY.name(), "tier", "EXACT",
                    "checkType", gate.checkType(), "gate", true, "citedAs", "practice",
                    "areaId", "gate", "name", gate.title(),
                    "appliesBecause", "A hard check — it runs before anything is read",
                    "ruleRef", String.join(", ", gate.refs()),
                    "severity", gate.severity(), "refs", gate.refs(),
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
                        "severity", "discrepancy", "area", "Time & availability", "areaId", "gate",
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
                log.info("Case {} halted at {}: {}", ctx.caseId(), gate.id(), result.why());
                // Written down before returning. The gate that stopped the examination is
                // the one step of the run somebody will certainly come looking for, and it
                // was the only one that left no row.
                ctx.recordStep(gate.id(), Map.of("verdict", result.outcome().name(),
                        "expiry", String.valueOf(expiry), "presented", String.valueOf(presented)));
                return StepResult.halted(gate.id(), statement);
            }

            // A gate that could not be settled does not halt. It is a hard check with a
            // missing operand — the covering schedule was not presented, most often — and
            // stopping an examination on something nobody could read would be worse than
            // letting it run and reporting what is missing.
            if (result.outcome() == RuleEvaluator.Outcome.INCONCLUSIVE) {
                log.info("Gate {} could not be settled on case {}: {}",
                        gate.id(), ctx.caseId(), result.why());
            }
            ctx.recordStep(gate.id(), Map.of("verdict", result.outcome().name(),
                    "expiry", String.valueOf(expiry), "presented", String.valueOf(presented)));
        }
        return StepResult.ok(Map.of("gates", gates.size(), "verdict", "PASS"));
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
