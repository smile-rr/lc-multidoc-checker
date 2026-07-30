package com.tb.helix.lccheck.stage.gate;

import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.governance.domain.CheckCatalog;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.*;
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

    public GateStage(CheckCatalog catalog, CaseStore cases) {
        this.catalog = catalog;
        this.cases = cases;
    }

    @Override
    public StageId id() {
        return StageId.GATE;
    }

    @Override
    public StageOutcome execute(StageContext ctx) {
        Map<String, Object> row = cases.find(ctx.caseId()).orElseThrow();
        List<CheckCatalog.CheckCard> gates = catalog.gates();

        // An override is the officer saying "I have seen this ground and I am continuing
        // anyway". The finding stays — it is still a discrepancy and still belongs in the
        // notice — but re-halting on every subsequent run would make the override do
        // nothing, which is how a case becomes impossible to move.
        if (row.get("gate_overridden_by") != null) {
            ctx.recordStep("overridden", Map.of(
                    "by", String.valueOf(row.get("gate_overridden_by")),
                    "check", String.valueOf(row.get("gate_halt_check_id"))));
            return StageOutcome.ok();
        }

        if (gates.isEmpty()) {
            ctx.recordStep("none", Map.of("note", "no hard checks are authored"));
            return StageOutcome.ok();
        }

        LocalDate expiry = date(row.get("expiry"));
        LocalDate presented = presentationDate(ctx, row);

        for (CheckCatalog.CheckCard gate : gates) {
            cases.upsertPlanCheck(ctx.caseId(), Rows.of(
                    "id", gate.id(), "origin", "DICTIONARY", "tier", "EXACT",
                    "checkType", gate.checkType(), "gate", true, "citedAs", "practice",
                    "areaId", "gate", "name", gate.title(),
                    "appliesBecause", "A hard check — it runs before anything is read",
                    "ruleRef", String.join(", ", gate.refs()),
                    "severity", gate.severity(), "refs", gate.refs(),
                    "status", "DONE", "ordinal", 0));

            // Expiry is the gate the catalogue actually ships. Evaluated here rather than
            // through the general SpEL path because a gate must not depend on anything the
            // presentation has to be read for — including the rule engine's own inputs.
            if (expiry != null && presented != null && presented.isAfter(expiry)) {
                String statement = "PRESENTATION MADE ON " + presented + " AFTER CREDIT EXPIRY " + expiry + ".";
                cases.upsertFinding(ctx.caseId(), Rows.of(
                        "id", "gate-" + gate.id(), "checkId", gate.id(),
                        "severity", "discrepancy", "area", "Time & availability", "areaId", "gate",
                        "docId", "CS", "title", gate.title(),
                        "statement", statement, "statementSource", "derived",
                        "expected", "Presented on or before " + expiry,
                        "quote", "Presented " + presented,
                        "reason", "UCP 600 art. 6(e) — presentation must be made on or before expiry.",
                        "creditAnchorId", "tag-31D",
                        "confidence", "HIGH"));
                ctx.recordStep(gate.id(), Map.of("verdict", "FAIL", "expiry", expiry.toString(),
                        "presented", presented.toString()));
                log.info("Case {} halted: presented {} after expiry {}", ctx.caseId(), presented, expiry);
                return StageOutcome.halted(gate.id(), statement);
            }
            ctx.recordStep(gate.id(), Map.of("verdict", "PASS",
                    "expiry", String.valueOf(expiry), "presented", String.valueOf(presented)));
        }
        return StageOutcome.ok();
    }

    /**
     * The date the presentation was made.
     *
     * <p>Read from the covering schedule when the presenting bank stated one, because that
     * is the date that governs; the date we received the file is a fallback and is recorded
     * as such rather than quietly presented as fact.
     */
    private LocalDate presentationDate(StageContext ctx, Map<String, Object> row) {
        for (Map<String, Object> f : cases.facts(ctx.caseId())) {
            if (!"CS".equals(f.get("doc_code"))) continue;
            String label = String.valueOf(f.get("label")).toLowerCase();
            if (label.contains("presentation") && label.contains("date")) {
                LocalDate d = date(f.get("value"));
                if (d != null) return d;
            }
        }
        return date(row.get("presented_date"));
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
