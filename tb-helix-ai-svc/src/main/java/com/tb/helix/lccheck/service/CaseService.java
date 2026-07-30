package com.tb.helix.lccheck.service;

import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.lccheck.domain.*;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.StageId;
import com.tb.helix.lccheck.stage.IntakeStage;
import com.tb.helix.lccheck.stage.Mt700Parser;
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
    private final Mt700Parser mt700;

    public CaseService(CaseStore store, CaseAssembler assembler, IntakeStage intake,
                       BlobStore blobs, PageRenderer renderer, Mt700Parser mt700) {
        this.store = store;
        this.assembler = assembler;
        this.intake = intake;
        this.blobs = blobs;
        this.renderer = renderer;
        this.mt700 = mt700;
    }

    // --- Reading ------------------------------------------------------------

    public List<CaseSummary> list(String scope, String officerId) {
        return store.list(scope, officerId).stream().map(assembler::summary).toList();
    }

    public CaseDetail detail(String ref) {
        String id = resolve(ref);
        Map<String, Object> row = store.find(id).orElseThrow(() -> new NotFoundException("case", ref));
        List<?> creditLines = assembler.creditLines(store, id);

        return new CaseDetail(
                String.valueOf(row.get("case_ref")),
                String.valueOf(row.get("status")),
                assembler.credit(row),
                row.get("presented_date") == null ? null : String.valueOf(row.get("presented_date")),
                (String) row.get("presenting_bank"),
                assembler.daysUntil(row.get("reply_due_date")),
                (String) row.get("authoriser"),
                "/api/v1/lc-check/cases/" + ref + "/bundle.pdf",
                row.get("page_count") instanceof Number n ? n.intValue() : 0,
                assembler.runState(row, store.bundlePages(id).size()),
                store.documents(id).stream().map(d -> assembler.document(d, creditLines)).toList(),
                store.bundlePages(id).stream().map(assembler::bundlePage).toList(),
                store.facts(id).stream().map(assembler::fact).toList(),
                Areas.ALL,
                store.planChecks(id).stream().map(assembler::planCheck).toList(),
                store.findings(id).stream().map(assembler::finding).toList(),
                store.runSteps(id));
    }

    /** The whole presentation, as the viewer fetches it. */
    public Optional<byte[]> bundlePdf(String ref) {
        Map<String, Object> row = store.find(resolve(ref)).orElseThrow(() -> new NotFoundException("case", ref));
        String sha = (String) row.get("bundle_pdf_sha");
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
        Map<String, Object> row = store.find(id).orElseThrow(() -> new NotFoundException("case", ref));
        String sha = (String) row.get("bundle_pdf_sha");
        List<Integer> pages = store.documents(id).stream()
                .filter(d -> docCode.equals(d.get("doc_code")))
                .findFirst().map(assembler::pagesOf).orElse(List.of());
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

    public Map<String, Object> create(byte[] credit, String creditName,
                                      byte[] bundle, String bundleName, String bundleType,
                                      String officerId) {
        String caseRef = nextRef();
        String caseId = store.create(caseRef, officerId);
        intake.ingest(caseId, credit, creditName, bundle, bundleName, bundleType);
        return Map.of("caseId", caseRef, "id", caseId);
    }

    public List<Map<String, String>> peek(byte[] creditText) {
        return assembler.peek(mt700.parse(new String(creditText, StandardCharsets.UTF_8)).credit());
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
        check.put("origin", "OFFICER");
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
                .filter(c -> checkId.equals(c.get("check_id")))
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
        return store.find(caseId).map(r -> r.get("authoriser") == null ? "the checker" : String.valueOf(r.get("authoriser")))
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
}
