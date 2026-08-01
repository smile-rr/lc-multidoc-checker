package com.tb.helix.lccheck.service;

import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
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

    public PlanCheckView planCheck(ReadRows.PlanCheck c) {
        return new PlanCheckView(
                c.checkId(), nz(c.name()), c.areaId(),
                nz(c.appliesBecause()), nz(c.ruleRef()),
                c.addedByOfficer(),
                false,
                c.notCovered(),
                lower(c.tier()),
                Origin.of(c.origin()).wire(),
                c.isGate(),
                nz(c.citedAs()), c.checkType(), c.executionPlan(),
                // The citations were being dropped here. `lc_plan_check.refs` holds them —
                // UCP600 Art.6, Art.14, Art.29 for the expiry gate — and the card that shows
                // a check's authority was rendering "no article recorded" for every check in
                // the system, because this map never carried them.
                Map.of("severity", nz(c.severity()),
                        "rule", nz(c.name()),
                        "refs", c.refs() == null ? List.of() : c.refs()));
    }

    public FindingView finding(ReadRows.Finding f) {
        return new FindingView(
                f.findingRef(), f.severity(), nz(f.area()),
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

    public RunState runState(CaseRow row, int segmented) {
        String stage = row.stage();
        boolean started = !"intake".equals(stage);
        boolean finished = List.of("execute", "signoff").contains(stage);
        String error = row.error();
        // Busy means a stage is running right now: the case is parked at neither the
        // officer nor an error. The browser reads it on load to decide whether to open a
        // stream — without it, a workbench opened mid-intake would sit on stale data
        // waiting for an event it never subscribed to.
        boolean busy = !finished && !row.awaitingOfficer() && (error == null || error.isBlank());
        // A halt is not a pause. `blockedAtGate` is true only while nobody has overridden,
        // which is the same condition the gate itself tests before halting again — one rule,
        // read in both places, rather than the screen and the engine each having a view.
        boolean halted = row.halted();
        return new RunState(stage, busy && !halted, error, started, finished, segmented,
                row.nextStage(), row.awaitingOfficer(), halted, row.gateHaltCheckId(),
                finished ? Areas.ALL.stream().map(CheckArea::id).toList() : List.of());
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
