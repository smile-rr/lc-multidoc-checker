package com.tb.helix.lccheck.service;

import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.stage.intake.IntakeStage;
import com.tb.helix.lccheck.stage.intake.SwiftFile;
import com.tb.helix.lccheck.stage.intake.SwiftMessage;
import com.tb.helix.lccheck.types.*;
import com.tb.helix.lccheck.types.document.*;
import com.tb.helix.lccheck.types.examination.*;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Database rows to the shapes the workbench reads.
 *
 * <p>Its own class because it is the one place the two vocabularies meet, and they are
 * deliberately different: the schema says {@code doc_code} and {@code is_gate}, the wire
 * says {@code docId} and {@code gate}. The browser should not learn our column names — a
 * rename in the schema would otherwise be a breaking API change.
 *
 * <p>Kept out of the controller, which should decide status codes and nothing else, and out
 * of the store, which should not know a browser exists.
 */
@Component
public class CaseAssembler {

    private final com.fasterxml.jackson.databind.ObjectMapper json;

    public CaseAssembler(com.fasterxml.jackson.databind.ObjectMapper json) {
        this.json = json;
    }

    public CaseSummary summary(ReadRows.CaseSummary r) {
        return new CaseSummary(
                r.caseRef(),
                nz(r.creditRef()),
                nz(r.beneficiary()),
                nz(r.currency()),
                num(r.amount()),
                r.pageCount(),
                r.status(),
                statusLabel(r.status()),
                r.replyDueDays(),
                true);
    }

    public CreditTerms credit(CaseRow r) {
        return new CreditTerms(
                nz(r.creditRef()), iso(r.issuedDate()),
                nz(r.applicant()), nz(r.beneficiary()),
                nz(r.currency()), num(r.amount()), num(r.tolerancePct()),
                iso(r.latestShipment()), iso(r.expiry()), nz(r.expiryPlace()),
                // 21 days is UCP 600 art. 14(c)'s default when the credit is silent.
                r.presentationDays() == null ? 21 : r.presentationDays(),
                nz(r.tenor()), nz(r.goods()));
    }

    /**
     * @param marks what the attest pass found on this document, already filtered to it. The
     *              credit gets none by construction: it arrives as a wire message and has no
     *              page to carry a signature.
     */
    public LcDocument document(ReadRows.Document d, List<?> creditLines, List<ReadRows.Mark> marks) {
        List<Integer> pages = d.pages();
        boolean isCredit = "credit".equals(d.role());
        return new LcDocument(
                d.docCode(), d.role(), nz(d.docTypeLabel()),
                nz(d.abbr()), nz(d.fileName()), nz(d.reference()), nz(d.icon()),
                pages.isEmpty() ? null : List.of(pages.get(0), pages.get(pages.size() - 1)),
                pages, nz(d.extractionMode()),
                d.lowConfidence(), d.scanNote(),
                nz(d.docTypeLabel()),
                pages.isEmpty() ? "" : "bundle pages " + String.join(", ", pages.stream().map(String::valueOf).toList()),
                isCredit ? creditLines : List.of(),
                isCredit ? List.of() : marks.stream().map(CaseAssembler::mark).toList(),
                d.attested(),
                d.layoutMd());
    }

    private static MarkView mark(ReadRows.Mark m) {
        return new MarkView(
                m.docCode(), m.kind(), m.page(), m.placement(), m.readsAs(),
                m.party(), m.capacity(), m.medium(), m.authenticates(),
                m.legible(), nz(m.confidence()));
    }

    public FactView fact(ReadRows.Fact f) {
        return new FactView(
                f.docCode(), f.anchorId(), f.page(), f.fieldKey(),
                f.label(), nz(f.value()), nz(f.source()),
                f.sourceText(), nz(f.confidence()), f.flag());
    }

    /**
     * @param findingRef what this check produced, or null if it produced nothing. Passed in
     *                   rather than looked up, because the caller holds both lists and a
     *                   lookup per check would be twenty-three queries for one join.
     */
    public PlanCheckView planCheck(ReadRows.PlanCheck c, String findingRef) {
        List<Map<String, Object>> rows = conditionRows(c.ruleDef());
        return new PlanCheckView(
                c.checkId(), nz(c.name()), c.areaId(),
                nz(c.appliesBecause()), nz(c.ruleRef()),
                c.addedByOfficer(),
                // Written to the column since the planner first existed, and read back
                // by nobody — this was a hardcoded `false`, so every requirement card
                // arrived claiming the dictionary wrote it and the plan filed all of
                // them under Rule. The column was right the whole time.
                c.plannedByLlm(),
                c.notCovered(),
                lower(c.tier()),
                Origin.of(c.origin()).wire(),
                c.isGate(),
                nz(c.citedAs()), c.checkType(), c.executionPlan(),
                // SEMI_DETERMINISTIC to semi-deterministic. The column is an enum and the
                // wire is a word the screen prints; the underscore is the schema's, not the
                // officer's.
                c.coverage() == null ? null : lower(c.coverage()).replace('_', '-'),
                c.suppressedBecause(),
                // Authored where there is an author, derived from the operands otherwise.
                // A threshold check declares no doc types — it is about the credit and the
                // covering schedule, which its operands say and nothing else does.
                c.docCodes().isEmpty() ? docsIn(rows) : c.docCodes(),
                findingRef,
                // The citations were being dropped here. `lc_plan_check.refs` holds them —
                // UCP600 Art.6, Art.14, Art.29 for the expiry gate — and the card that shows
                // a check's authority was rendering "no article recorded" for every check in
                // the system, because this map never carried them.
                Rows.of("severity", nz(c.severity()),
                        "rule", nz(c.name()),
                        "refs", c.refs() == null ? List.of() : c.refs(),
                        // The condition itself, flattened to the rows a screen draws. A check
                        // whose condition the officer cannot read is a label, not a check —
                        // and this is the only way a planner-authored exact rule, which
                        // exists in no dictionary, can be read at all.
                        "rows", rows));
    }

    /** The documents a condition reads, in the order it reads them, without repeats. */
    @SuppressWarnings("unchecked")
    private List<String> docsIn(List<Map<String, Object>> rows) {
        List<String> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            for (String side : List.of("l", "r")) {
                if (row.get(side) instanceof Map<?, ?> o
                        && ((Map<String, Object>) o).get("doc") instanceof String doc
                        && !doc.isBlank() && !out.contains(doc)) {
                    out.add(doc);
                }
            }
        }
        return out;
    }

    /**
     * The rows of a stored condition tree, groups flattened away.
     *
     * <p>Groups and their connectors matter to the evaluator and not to a reader — a plan
     * screen showing "group 1 of 2, connector AND" is showing its own data structure. Every
     * seeded rule is one group; the flattening loses nothing anybody reads.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> conditionRows(String ruleDef) {
        if (ruleDef == null || ruleDef.isBlank()) return List.of();
        try {
            Object parsed = json.readValue(ruleDef, Object.class);
            List<Map<String, Object>> out = new ArrayList<>();
            if (parsed instanceof List<?> groups) {
                for (Object g : groups) {
                    if (g instanceof Map<?, ?> group && group.get("rows") instanceof List<?> rows) {
                        for (Object r : rows) if (r instanceof Map<?, ?> row) out.add((Map<String, Object>) row);
                    }
                }
            }
            return out;
        } catch (Exception e) {
            // A condition that cannot be read costs the officer the working, not the check.
            return List.of();
        }
    }

    public FindingView finding(ReadRows.Finding f) {
        return new FindingView(
                f.findingRef(), f.outcome(), f.outcomeReason(), nz(f.area()),
                f.areaId(), f.checkId(), nz(f.docCode()),
                f.page(), f.anchorId(), nz(f.creditAnchorId()),
                nz(f.title()), nz(f.statement()), nz(f.statementSource()),
                nz(f.detail()), nz(f.expected()), nz(f.quote()),
                nz(f.quoteSource()), nz(f.reason()),
                f.raisedByOfficer(),
                // Read through the plan check, never stored twice — a finding that carried
                // its own copy would drift from the check that produced it.
                f.tier() == null ? null : lower(f.tier()),
                Origin.of(f.origin()).wire(),
                f.checkType(), f.citedAs(),
                jsonObject(f.analysis()),
                List.of());
    }

    /**
     * A jsonb column as a map.
     *
     * <p>Parsed here rather than in the row, because a row reports what the column holds and
     * this is an interpretation of it. Unparseable is empty rather than fatal: a malformed
     * analysis costs the officer an explanation, not the finding.
     */
    private Map<String, Object> jsonObject(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            return json.readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }

    /**
     * How far the examination has got, and where a run that is not being watched should end.
     *
     * <p>Reads the planner's verdict off the case rather than recomputing it. Two answers
     * come out of it and both are the plan's to give: whether the remaining checks were
     * deliberately not run, and whether anything on the plan needs a person. A browser
     * working the second one out for itself would be re-deriving a decision from a copy of
     * the thing that made it.
     */
    public RunState runState(CaseRow row, int segmented) {
        String stage = row.stage();
        boolean started = !"intake".equals(stage);
        boolean ran = List.of("execute", "signoff").contains(stage);

        Map<String, Object> plan = jsonObject(row.planDecision());
        // Only after the plan itself, and only while the checks it stood down are still
        // standing down. Once execute has run they have not been skipped, whatever the plan
        // once decided — the officer pressed the button and changed the answer.
        boolean stoppedAfterPlan = !ran && !plan.isEmpty() && Boolean.FALSE.equals(plan.get("runRemaining"));

        // A run the plan ended is a run that is over. Without this the workbench would sit on
        // "Paused · 2 of 3 steps" for a case nothing further is going to happen to, hide the
        // findings behind an area that will never report itself complete, and offer a report
        // it does not believe is ready.
        boolean finished = ran || stoppedAfterPlan;

        String error = row.error();
        // Busy means a stage is running right now: the case is parked at neither the
        // officer nor an error. The browser reads it on load to decide whether to open a
        // stream — without it, a workbench opened mid-intake would sit on stale data
        // waiting for an event it never subscribed to.
        boolean busy = !finished && !row.awaitingOfficer() && (error == null || error.isBlank());
        boolean halted = row.halted();

        return new RunState(stage, busy && !halted, error, started, finished, segmented,
                row.nextStage(), row.awaitingOfficer(), halted, row.gateHaltCheckId(),
                stoppedAfterPlan, stoppedAfterPlan ? nz(plan.get("why")) : null,
                ran ? 0 : intOf(plan.get("remaining")),
                intOf(plan.get("humanReview")),
                // Auto ends at the decision. It stops at the report only when the plan holds
                // something a person has to settle — the plan answered that when it was made,
                // and it does not change afterwards.
                plan.get("destination") == null ? "decision" : String.valueOf(plan.get("destination")),
                finished ? Areas.ALL.stream().map(CheckArea::id).toList() : List.of());
    }

    private static int intOf(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }

    public Map<String, Object> bundlePage(ReadRows.BundlePage p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("number", p.pageNo());
        m.put("docId", nz(p.docCode()));
        m.put("label", nz(p.label()));
        return m;
    }

    /**
     * The credit at a glance, for the dialog shown before a case exists.
     *
     * <p>Straight off the tags, unparsed — {@code :32B:} as written, not as understood.
     * The dialog's question is "is this the right file", which a reference and an amount
     * answer, and it has to answer instantly: there is no case yet, so no stream to report
     * progress on, so anything slow here is a dialog that hangs.
     *
     * <p>Deliberately not the same reading the examination uses. That one is a model's, it
     * happens in intake, and it reports itself as it goes.
     */
    public List<Map<String, String>> peek(SwiftFile file) {
        List<Map<String, String>> out = new ArrayList<>();
        if (file.messages().isEmpty()) return out;

        // The issue, when there is one — its tags are the ones a person recognises the
        // credit by. A file of amendments alone falls back to whatever arrived first, which
        // is more useful than four blank rows.
        SwiftMessage m = file.hasCredit() ? file.credit() : file.messages().get(0);

        out.add(Map.of("label", "Message", "value", file.messages().size() == 1
                ? m.type().label()
                : m.type().label() + " + " + (file.messages().size() - 1) + " more"));
        out.add(Map.of("label", "Credit", "value", firstLine(m.tag("20"))));
        out.add(Map.of("label", "Amount", "value", firstLine(m.tag("32B"))));
        out.add(Map.of("label", "Beneficiary", "value", firstLine(m.tag("59"))));
        out.add(Map.of("label", "Applicant", "value", firstLine(m.tag("50"))));
        return out;
    }

    /** A party field runs to four lines; the dialog has room for the name. */
    private String firstLine(String tag) {
        if (tag == null || tag.isBlank()) return "—";
        return tag.strip().lines().findFirst().orElse("—").strip();
    }

    /**
     * Days until the refusal notice is due.
     *
     * <p>Computed, never stored. Under UCP 600 art. 16(d) a bank has five banking days;
     * a countdown written to a column is wrong by the next morning.
     */
    public Integer daysUntil(LocalDate d) {
        return d == null ? null : (int) Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), d));
    }

    /** A date as the wire wants it, or null. The record already parsed it. */
    private String iso(LocalDate d) {
        return d == null ? null : d.toString();
    }


    public List<?> creditLines(CaseStore store, String caseId) {
        return store.stepResult(caseId, StageId.INTAKE.key(), IntakeStage.CREDIT)
                .map(r -> (List<?>) r.getOrDefault("lines", List.of()))
                .orElse(List.of());
    }

    // --- Conversions --------------------------------------------------------

    private static String statusLabel(String status) {
        return switch (status == null ? "" : status) {
            case "awaiting_check" -> "Awaiting check";
            case "running" -> "Running";
            case "discrepancies" -> "Discrepancies";
            case "to_decide" -> "To decide";
            case "clean" -> "Clean";
            case "with_authoriser" -> "With authoriser";
            default -> status;
        };
    }

    private static Number num(Object o) {
        return o instanceof Number n ? n : 0;
    }

    private static String lower(Object o) {
        return o == null ? null : String.valueOf(o).toLowerCase();
    }

    // Empty string where the UI renders the value directly and a null would print
    // "null"; str() where it branches on absence and null is the honest answer.
    //
    // Still Object-typed, and now only because a few values still arrive from parsed model
    // JSON rather than from a column. Everything that comes off a row is already typed —
    // asDate(), date() and asInt() went with the maps that needed them.
    private static String nz(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
