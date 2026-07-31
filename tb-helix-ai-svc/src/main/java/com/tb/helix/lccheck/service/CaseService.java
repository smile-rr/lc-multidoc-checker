package com.tb.helix.lccheck.service;

import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.pipeline.StageLauncher;
import com.tb.helix.lccheck.stage.intake.IntakeStage;
import com.tb.helix.lccheck.stage.intake.SwiftReader;
import com.tb.helix.lccheck.types.*;
import com.tb.helix.lccheck.types.document.*;
import com.tb.helix.lccheck.types.examination.*;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * What a case is, and what can be done to one.
 *
 * <p>Everything the controller used to do apart from choosing a status code: resolving a
 * reference, assembling a detail, recording a decision. Put here so the same operations are
 * available to something that is not HTTP — a scheduled sweep, a batch import, a test —
 * without going through a servlet.
 */
@Service
public class CaseService {

    private final CaseStore store;
    private final CaseAssembler assembler;
    private final IntakeStage intake;
    private final BlobStore blobs;
    private final PageRenderer renderer;
    private final SwiftReader swift;
    private final StageLauncher pipeline;

    public CaseService(CaseStore store, CaseAssembler assembler, IntakeStage intake,
                       BlobStore blobs, PageRenderer renderer,
                       SwiftReader swift, StageLauncher pipeline) {
        this.store = store;
        this.assembler = assembler;
        this.intake = intake;
        this.blobs = blobs;
        this.renderer = renderer;
        this.swift = swift;
        this.pipeline = pipeline;
    }

    // --- Reading ------------------------------------------------------------

    public List<CaseSummary> list(String scope, String officerId) {
        return store.list(scope, officerId).stream().map(assembler::summary).toList();
    }

    public CaseDetail detail(String ref) {
        String id = resolve(ref);
        CaseRow row = store.find(id).orElseThrow(() -> new NotFoundException("case", ref));
        List<?> creditLines = assembler.creditLines(store, id);

        return new CaseDetail(
                row.caseRef(),
                row.status(),
                assembler.credit(row),
                row.presentedDate() == null ? null : row.presentedDate().toString(),
                row.presentingBank(),
                assembler.daysUntil(row.replyDueDate()),
                row.authoriser(),
                "/api/v1/lc-check/cases/" + ref + "/bundle.pdf",
                row.pageCount(),
                assembler.runState(row, store.bundlePages(id).size()),
                store.documents(id).stream().map(d -> assembler.document(d, creditLines)).toList(),
                store.bundlePages(id).stream().map(assembler::bundlePage).toList(),
                store.facts(id).stream().map(assembler::fact).toList(),
                Areas.ALL,
                store.planChecks(id).stream().map(assembler::planCheck).toList(),
                store.findings(id).stream().map(assembler::finding).toList(),
                store.runSteps(id).stream().map(ReadRows.RunStep::asView).toList());
    }

    /** The whole presentation, as the viewer fetches it. */
    public Optional<byte[]> bundlePdf(String ref) {
        String sha = store.find(resolve(ref))
                .orElseThrow(() -> new NotFoundException("case", ref)).bundlePdfSha();
        return sha == null ? Optional.empty() : blobs.get(sha);
    }

    /**
     * One document, split out of the bundle on demand.
     *
     * <p>On demand rather than stored: a bundle's documents are page ranges within one
     * scanned file, and splitting eagerly writes N near-duplicates of bytes already held.
     */
    public Optional<byte[]> documentPdf(String ref, String docCode) {
        String id = resolve(ref);
        String sha = store.find(id).orElseThrow(() -> new NotFoundException("case", ref)).bundlePdfSha();
        List<Integer> pages = store.documents(id).stream()
                .filter(d -> docCode.equals(d.docCode()))
                .findFirst().map(ReadRows.Document::pages).orElse(List.of());
        return sha == null || pages.isEmpty()
                ? Optional.empty()
                : Optional.of(renderer.extractPages(sha, pages));
    }

    public String mt734(String ref) {
        return store.stepResult(resolve(ref), "signoff", "report")
                .map(r -> String.valueOf(r.get("mt734")))
                .orElse("Not signed off yet.");
    }

    // --- Writing ------------------------------------------------------------

    /**
     * Opens a case.
     *
     * <p>Returns as soon as the uploads are on disk and the case exists — milliseconds —
     * and leaves the reading to the pipeline. The officer lands on the workbench while the
     * credit is still being read and watches it fill in, rather than holding a dialog open
     * for a model call and arriving at a case with nothing in it.
     *
     * <p>The ordering matters and is not an optimisation: the evidence is stored before
     * anything interprets it, so a failed read costs a rerun rather than a re-upload.
     */
    public Map<String, Object> create(byte[] credit, String creditName,
                                      byte[] bundle, String bundleName, String bundleType,
                                      String officerId) {
        String caseRef = nextRef();
        String caseId = store.create(caseRef, officerId);
        intake.receive(caseId, credit, creditName, bundle, bundleName, bundleType);
        pipeline.executeAsync(caseId, StageId.INTAKE, officerId);
        return Map.of("caseId", caseRef, "id", caseId);
    }

    /**
     * What the credit says on its face, before a case exists.
     *
     * <p>Mechanical: the SWIFT tags as written, no model. The dialog is asking "is this the
     * right file" and a person answers that from the reference and the amount — so it must
     * come back instantly, and there is no case yet to stream progress against. The reading
     * that the examination relies on is {@code CreditReader}'s, and it happens in intake
     * where it can report itself.
     */
    public List<Map<String, String>> peek(byte[] creditText) {
        return assembler.peek(swift.read(new String(creditText, StandardCharsets.UTF_8)));
    }

    /**
     * The officer takes the gate's ground on themselves and lets the examination continue.
     *
     * <p>The finding stays. A hard check found something that makes this presentation
     * refusable and that remains true whoever signs it off — the override says the officer
     * has read it and accepts the consequence, not that the gate was wrong. That is why it is
     * recorded against a name in the audit log and why it names the check it releases.
     *
     * <p>Without this the case is a dead end: {@code gate_overridden_by} was read by the gate
     * and written by nothing, so a halted case could neither proceed nor be closed.
     */
    public void overrideGate(String ref, String note, String officerId) {
        String id = resolve(ref);
        CaseRow row = store.find(id).orElseThrow();
        if (!row.gateHalted()) {
            throw new IllegalStateException("Case " + ref + " is not halted at a hard check");
        }
        String who = officerId == null || officerId.isBlank() ? "officer" : officerId;
        store.patchCase(id, Map.of("gate_overridden_by", who));
        store.recordAction(id, "gate_override", String.valueOf(row.gateHaltCheckId()),
                Map.of("checkId", String.valueOf(row.gateHaltCheckId())), who, note);
    }

    public void decide(String ref, String findingRef, String disposition, String note, String officerId) {
        store.recordAction(resolve(ref), "disposition", findingRef,
                Map.of("disposition", disposition == null ? "" : disposition), officerId, note);
    }

    /**
     * A check the officer added to this case.
     *
     * <p>Recorded against their name, and never mistaken for a dictionary rule: nobody
     * reviewed it before it ran, and the plan says so.
     */
    public PlanCheckView addCheck(String ref, String name, String officerId) {
        String id = resolve(ref);
        String checkId = "USER-" + String.format("%02d", (Math.abs(Objects.hashCode(name)) % 89) + 1);

        Map<String, Object> check = new LinkedHashMap<>();
        check.put("id", checkId);
        check.put("origin", Origin.OFFICER.name());
        check.put("tier", "JUDGED");
        check.put("name", name);
        check.put("appliesBecause", "You added it to this case");
        check.put("ruleRef", "Your judgement — recorded against your name");
        check.put("addedByOfficer", true);
        check.put("addedBy", officerId);
        check.put("status", "PLANNED");
        store.upsertPlanCheck(id, check);
        store.recordAction(id, "add_check", checkId, Map.of("name", name), officerId, null);

        return store.planChecks(id).stream()
                .filter(c -> checkId.equals(c.checkId()))
                .findFirst().map(assembler::planCheck)
                .orElseThrow(() -> new NotFoundException("check", checkId));
    }

    /** Records the verdict and the covering note, then assembles the advice. */
    public String signoff(String ref, String verdict, String note, String officerId) {
        String id = resolve(ref);
        store.recordAction(id, "verdict", "-", Map.of("verdict", verdict == null ? "" : verdict), officerId, null);
        store.recordAction(id, "review_note", "-", Map.of(), officerId, note);
        store.recordAction(id, "submit", "-", Map.of(), officerId, null);
        return id;
    }

    public String routedTo(String caseId) {
        return store.find(caseId).map(CaseRow::authoriser).filter(a -> a != null)
                .orElse("the checker");
    }

    // --- Identity -----------------------------------------------------------

    /**
     * A case reference to its id.
     *
     * <p>The reference is what an officer says out loud and quotes in an advice; the uuid
     * is a surrogate nobody should have to see. A raw uuid is tolerated too, which is worth
     * the two lines when debugging from a SQL console.
     */
    public String resolve(String ref) {
        return store.idForRef(ref).orElseGet(() -> {
            if (ref != null && ref.length() == 36 && store.find(ref).isPresent()) return ref;
            throw new NotFoundException("case", ref);
        });
    }

    public StageId stage(String key) {
        return StageId.fromKey(key).orElseThrow(() -> new IllegalArgumentException("No such stage: " + key));
    }

    private String nextRef() {
        LocalDate d = LocalDate.now();
        long n = store.list("all", null).size() + 1;
        return "CHK-%02d-%02d%02d-%03d".formatted(d.getYear() % 100, d.getMonthValue(), d.getDayOfMonth(), n);
    }
    /** Portfolio figures from the examination side, for the spend panel. */
    public java.util.Map<String, Object> portfolio(java.time.Instant since) {
        return store.portfolioSince(since);
    }

}
