package com.tb.helix.lccheck.api;

import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.error.NotFoundException;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.PipelineService;
import com.tb.helix.lccheck.pipeline.StageId;
import com.tb.helix.lccheck.stage.IntakeStage;
import com.tb.helix.lccheck.stage.Mt700Parser;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

/**
 * The lc-check HTTP surface.
 *
 * <p>Shapes match what the UI's contracts declare, because the UI was built first and its
 * fixtures are the specification. Where the database column name and the wire name differ
 * — {@code doc_code} vs {@code docId} — the wire name wins: the browser should not learn
 * our schema.
 */
@RestController
@RequestMapping("/api/v1/lc-check")
public class CaseController {

    private final CaseStore cases;
    private final IntakeStage intake;
    private final PipelineService pipeline;
    private final BlobStore blobs;
    private final PageRenderer renderer;
    private final Mt700Parser mt700;
    private final com.tb.helix.infra.stream.EventStream stream;

    public CaseController(CaseStore cases, IntakeStage intake, PipelineService pipeline,
                          BlobStore blobs, PageRenderer renderer, Mt700Parser mt700,
                          com.tb.helix.infra.stream.EventStream stream) {
        this.cases = cases;
        this.intake = intake;
        this.pipeline = pipeline;
        this.blobs = blobs;
        this.renderer = renderer;
        this.mt700 = mt700;
        this.stream = stream;
    }

    // --- List and create ----------------------------------------------------

    @GetMapping("/cases")
    public List<Map<String, Object>> list(@RequestParam(defaultValue = "all") String scope,
                                          @RequestParam(defaultValue = "officer") String officerId) {
        return cases.list(scope, officerId).stream().map(this::summary).toList();
    }

    @PostMapping(value = "/cases", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> create(@RequestPart(value = "credit", required = false) MultipartFile credit,
                                      @RequestPart(value = "bundle", required = false) MultipartFile bundle,
                                      @RequestParam(defaultValue = "officer") String officerId)
            throws IOException {

        String caseRef = nextRef();
        String caseId = cases.create(caseRef, officerId);

        intake.ingest(caseId,
                credit == null ? null : credit.getBytes(),
                credit == null ? null : credit.getOriginalFilename(),
                bundle == null ? null : bundle.getBytes(),
                bundle == null ? null : bundle.getOriginalFilename(),
                bundle == null ? null : bundle.getContentType());

        return Map.of("caseId", caseRef, "id", caseId);
    }

    /** What the credit says, before a case exists — for the New check dialog. */
    @PostMapping(value = "/cases/peek", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<Map<String, String>> peek(@RequestPart("credit") MultipartFile credit) throws IOException {
        var parsed = mt700.parse(new String(credit.getBytes(), StandardCharsets.UTF_8));
        var c = parsed.credit();
        List<Map<String, String>> out = new ArrayList<>();
        out.add(Map.of("label", "Credit", "value",
                nz(c.get("creditRef")) + (c.get("expiry") == null ? "" : " · expires " + c.get("expiry"))));
        out.add(Map.of("label", "Amount", "value", nz(c.get("currency")) + " " + nz(c.get("amount"))));
        out.add(Map.of("label", "Beneficiary", "value", nz(c.get("beneficiary"))));
        out.add(Map.of("label", "Applicant", "value", nz(c.get("applicant"))));
        return out;
    }

    // --- One case -----------------------------------------------------------

    @GetMapping("/cases/{ref}")
    public Map<String, Object> detail(@PathVariable String ref) {
        String id = resolve(ref);
        Map<String, Object> row = cases.find(id).orElseThrow(() -> new NotFoundException("case", ref));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.get("case_ref"));
        out.put("status", row.get("status"));
        out.put("credit", credit(row));
        out.put("presentedDate", str(row.get("presented_date")));
        out.put("presentingBank", row.get("presenting_bank"));
        out.put("replyDueDays", daysUntil(row.get("reply_due_date")));
        out.put("authoriser", row.get("authoriser"));
        out.put("pdfUrl", "/api/v1/lc-check/cases/" + ref + "/bundle.pdf");
        out.put("totalPages", row.get("page_count"));
        out.put("runState", runState(row, id));
        out.put("documents", documents(id));
        out.put("bundlePages", cases.bundlePages(id).stream().map(p -> Map.of(
                "number", p.get("page_no"),
                "docId", nz(p.get("doc_code")),
                "label", nz(p.get("label")))).toList());
        out.put("facts", cases.facts(id).stream().map(this::fact).toList());
        out.put("areas", AREAS);
        out.put("checks", cases.planChecks(id).stream().map(this::planCheck).toList());
        out.put("findings", cases.findings(id).stream().map(this::finding).toList());
        out.put("runSteps", cases.runSteps(id));
        return out;
    }

    @GetMapping("/cases/{ref}/bundle.pdf")
    public ResponseEntity<byte[]> bundle(@PathVariable String ref) {
        Map<String, Object> row = cases.find(resolve(ref)).orElseThrow(() -> new NotFoundException("case", ref));
        String sha = (String) row.get("bundle_pdf_sha");
        if (sha == null) return ResponseEntity.notFound().build();
        return blobs.get(sha)
                .map(b -> ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(b))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** One document, split out of the bundle on demand rather than stored separately. */
    @GetMapping("/cases/{ref}/documents/{docCode}/pdf")
    public ResponseEntity<byte[]> document(@PathVariable String ref, @PathVariable String docCode) {
        String id = resolve(ref);
        Map<String, Object> row = cases.find(id).orElseThrow(() -> new NotFoundException("case", ref));
        String sha = (String) row.get("bundle_pdf_sha");

        List<Integer> pages = cases.documents(id).stream()
                .filter(d -> docCode.equals(d.get("doc_code")))
                .findFirst()
                .map(d -> pagesOf(d))
                .orElse(List.of());
        if (sha == null || pages.isEmpty()) return ResponseEntity.notFound().build();

        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .body(renderer.extractPages(sha, pages));
    }

    // --- Running ------------------------------------------------------------

    @PostMapping("/cases/{ref}/stages/{stage}/run")
    public Map<String, Object> run(@PathVariable String ref, @PathVariable String stage,
                                   @RequestParam(defaultValue = "officer") String officerId) {
        StageId id = StageId.fromKey(stage)
                .orElseThrow(() -> new IllegalArgumentException("No such stage: " + stage));
        pipeline.runStage(resolve(ref), id, officerId);
        return Map.of("started", stage);
    }

    @PostMapping("/cases/{ref}/stages/{stage}/rerun")
    public Map<String, Object> rerun(@PathVariable String ref, @PathVariable String stage,
                                     @RequestParam(defaultValue = "officer") String officerId) {
        StageId id = StageId.fromKey(stage)
                .orElseThrow(() -> new IllegalArgumentException("No such stage: " + stage));
        pipeline.rerunStage(resolve(ref), id, officerId);
        return Map.of("rerunning", stage);
    }

    @GetMapping(value = "/cases/{ref}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCase(@PathVariable String ref,
                                 @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        long from = lastEventId == null ? 0 : Long.parseLong(lastEventId);
        return stream.subscribe(resolve(ref), from);
    }

    // --- Officer decisions --------------------------------------------------

    @PostMapping("/cases/{ref}/findings/{findingRef}/decision")
    public Map<String, Object> decide(@PathVariable String ref, @PathVariable String findingRef,
                                      @RequestBody Map<String, Object> body,
                                      @RequestParam(defaultValue = "officer") String officerId) {
        String id = resolve(ref);
        cases.recordAction(id, "disposition", findingRef,
                Map.of("disposition", nz(body.get("disposition"))), officerId, str(body.get("note")));
        return Map.of("recorded", true);
    }

    @PostMapping("/cases/{ref}/checks")
    public Map<String, Object> addCheck(@PathVariable String ref, @RequestBody Map<String, Object> body,
                                        @RequestParam(defaultValue = "officer") String officerId) {
        String id = resolve(ref);
        String checkId = "USER-" + String.format("%02d",
                (Math.abs(Objects.hashCode(body.get("name"))) % 89) + 1);
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("id", checkId);
        check.put("origin", "OFFICER");
        check.put("tier", "JUDGED");
        check.put("name", body.get("name"));
        check.put("appliesBecause", "You added it to this case");
        check.put("ruleRef", "Your judgement — recorded against your name");
        check.put("addedByOfficer", true);
        check.put("addedBy", officerId);
        check.put("status", "PLANNED");
        cases.upsertPlanCheck(id, check);
        cases.recordAction(id, "add_check", checkId, body, officerId, null);
        return Map.of("id", checkId, "name", nz(body.get("name")), "addedByOfficer", true);
    }

    @PostMapping("/cases/{ref}/signoff")
    public Map<String, Object> signoff(@PathVariable String ref, @RequestBody Map<String, Object> body,
                                       @RequestParam(defaultValue = "officer") String officerId) {
        String id = resolve(ref);
        cases.recordAction(id, "verdict", "-", Map.of("verdict", nz(body.get("verdict"))), officerId, null);
        cases.recordAction(id, "review_note", "-", Map.of(), officerId, str(body.get("note")));
        cases.recordAction(id, "submit", "-", Map.of(), officerId, null);
        pipeline.runStage(id, StageId.SIGNOFF, officerId);
        Map<String, Object> row = cases.find(id).orElseThrow();
        return Map.of("routedTo", nz(row.getOrDefault("authoriser", "the checker")));
    }

    @GetMapping(value = "/cases/{ref}/mt734", produces = MediaType.TEXT_PLAIN_VALUE)
    public String mt734(@PathVariable String ref) {
        return cases.stepResult(resolve(ref), "signoff", "report")
                .map(r -> String.valueOf(r.get("mt734")))
                .orElse("Not signed off yet.");
    }

    @GetMapping("/metrics/spend")
    public Map<String, Object> spend(@RequestParam(defaultValue = "30d") String period) {
        return Map.of("period", period, "cases", cases.list("all", null).size());
    }

    // --- Wire shapes --------------------------------------------------------

    private Map<String, Object> summary(Map<String, Object> r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", r.get("case_ref"));
        out.put("creditRef", nz(r.get("credit_ref")));
        out.put("beneficiary", nz(r.get("beneficiary")));
        out.put("currency", nz(r.get("currency")));
        out.put("amount", r.get("amount") == null ? 0 : r.get("amount"));
        out.put("pageCount", r.get("page_count"));
        out.put("status", r.get("status"));
        out.put("statusLabel", label(String.valueOf(r.get("status"))));
        out.put("replyDueDays", r.get("reply_due_days"));
        out.put("mine", true);
        return out;
    }

    private Map<String, Object> credit(Map<String, Object> r) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("creditRef", nz(r.get("credit_ref")));
        c.put("issuedDate", str(r.get("issued_date")));
        c.put("applicant", nz(r.get("applicant")));
        c.put("beneficiary", nz(r.get("beneficiary")));
        c.put("currency", nz(r.get("currency")));
        c.put("amount", r.get("amount") == null ? 0 : r.get("amount"));
        c.put("tolerancePct", r.get("tolerance_pct") == null ? 0 : r.get("tolerance_pct"));
        c.put("latestShipment", str(r.get("latest_shipment")));
        c.put("expiry", str(r.get("expiry")));
        c.put("expiryPlace", nz(r.get("expiry_place")));
        c.put("presentationDays", r.get("presentation_days") == null ? 21 : r.get("presentation_days"));
        c.put("tenor", nz(r.get("tenor")));
        c.put("goods", nz(r.get("goods")));
        return c;
    }

    private List<Map<String, Object>> documents(String id) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> d : cases.documents(id)) {
            Map<String, Object> m = new LinkedHashMap<>();
            String code = String.valueOf(d.get("doc_code"));
            m.put("id", code);
            m.put("role", d.get("role"));
            m.put("docType", nz(d.get("doc_type_label")));
            m.put("abbr", nz(d.get("abbr")));
            m.put("fileName", nz(d.get("file_name")));
            m.put("reference", nz(d.get("reference")));
            m.put("icon", nz(d.get("icon")));
            List<Integer> pages = pagesOf(d);
            m.put("pages", pages);
            m.put("pageRange", pages.isEmpty() ? null
                    : List.of(pages.get(0), pages.get(pages.size() - 1)));
            m.put("extraction", nz(d.get("extraction_mode")));
            m.put("lowConfidence", Boolean.TRUE.equals(d.get("low_confidence")));
            m.put("scanNote", d.get("scan_note"));
            m.put("title", nz(d.get("doc_type_label")));
            m.put("meta", pages.isEmpty() ? "" : "bundle pages " + pages.get(0) + "–" + pages.get(pages.size() - 1));
            m.put("lines", "credit".equals(d.get("role")) ? creditLines(id) : List.of());
            m.put("marks", List.of());
            out.add(m);
        }
        return out;
    }

    private List<?> creditLines(String id) {
        return cases.stepResult(id, "intake", "mt700")
                .map(r -> (List<?>) r.getOrDefault("lines", List.of()))
                .orElse(List.of());
    }

    private Map<String, Object> fact(Map<String, Object> f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("docId", f.get("doc_code"));
        m.put("anchorId", f.get("anchor_id"));
        m.put("page", f.get("page"));
        m.put("label", f.get("label"));
        m.put("value", nz(f.get("value")));
        m.put("source", nz(f.get("source")));
        m.put("sourceText", f.get("source_text"));
        m.put("confidence", nz(f.get("confidence")));
        m.put("flag", f.get("flag"));
        return m;
    }

    private Map<String, Object> planCheck(Map<String, Object> c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.get("check_id"));
        m.put("name", nz(c.get("name")));
        m.put("areaId", c.get("area_id"));
        m.put("appliesBecause", nz(c.get("applies_because")));
        m.put("ruleRef", nz(c.get("rule_ref")));
        m.put("addedByOfficer", Boolean.TRUE.equals(c.get("added_by_officer")));
        m.put("plannedByLlm", Boolean.TRUE.equals(c.get("planned_by_llm")));
        m.put("notCovered", Boolean.TRUE.equals(c.get("not_covered")));
        // The UI groups by these three; they are the vocabulary, not decoration.
        m.put("tier", String.valueOf(c.get("tier")).toLowerCase());
        m.put("origin", "CREDIT".equals(c.get("origin")) ? "credit" : "dictionary");
        m.put("gate", Boolean.TRUE.equals(c.get("is_gate")));
        m.put("source", nz(c.get("cited_as")));
        m.put("checkType", c.get("check_type"));
        m.put("executionPlan", c.get("execution_plan"));
        m.put("spec", Map.of("severity", nz(c.get("severity")), "rule", nz(c.get("name"))));
        return m;
    }

    private Map<String, Object> finding(Map<String, Object> f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.get("finding_ref"));
        m.put("severity", f.get("severity"));
        m.put("area", nz(f.get("area")));
        m.put("areaId", f.get("area_id"));
        m.put("checkId", f.get("check_id"));
        m.put("docId", nz(f.get("doc_code")));
        m.put("page", f.get("page"));
        m.put("anchorId", f.get("anchor_id"));
        m.put("creditAnchorId", nz(f.get("credit_anchor_id")));
        m.put("title", nz(f.get("title")));
        m.put("statement", nz(f.get("statement")));
        m.put("statementSource", nz(f.get("statement_source")));
        m.put("detail", nz(f.get("detail")));
        m.put("expected", nz(f.get("expected")));
        m.put("quote", nz(f.get("quote")));
        m.put("quoteSource", nz(f.get("quote_source")));
        m.put("reason", nz(f.get("reason")));
        m.put("raisedByOfficer", Boolean.TRUE.equals(f.get("raised_by_officer")));
        m.put("settledBy", f.get("tier") == null ? null : String.valueOf(f.get("tier")).toLowerCase());
        m.put("origin", "CREDIT".equals(f.get("origin")) ? "credit" : "dictionary");
        m.put("checkType", f.get("check_type"));
        m.put("source", f.get("cited_as"));
        m.put("trace", List.of());
        return m;
    }

    private Map<String, Object> runState(Map<String, Object> row, String id) {
        String stage = String.valueOf(row.get("stage"));
        boolean started = !"intake".equals(stage);
        boolean finished = List.of("execute", "signoff").contains(stage);
        List<String> areas = finished ? AREAS.stream().map(a -> String.valueOf(a.get("id"))).toList() : List.of();
        return Map.of("started", started, "finished", finished,
                "segmented", cases.bundlePages(id).size(), "completedAreaIds", areas);
    }

    // --- Helpers ------------------------------------------------------------

    private String resolve(String ref) {
        return cases.idForRef(ref).orElseGet(() -> {
            // Tolerate a raw uuid too — useful when debugging from a SQL console.
            if (ref.length() == 36 && cases.find(ref).isPresent()) return ref;
            throw new NotFoundException("case", ref);
        });
    }

    private String nextRef() {
        LocalDate d = LocalDate.now();
        long n = cases.list("all", null).size() + 1;
        return "CHK-%02d-%02d%02d-%03d".formatted(d.getYear() % 100, d.getMonthValue(), d.getDayOfMonth(), n);
    }

    @SuppressWarnings("unchecked")
    private List<Integer> pagesOf(Map<String, Object> d) {
        Object pages = d.get("pages");
        if (pages instanceof java.sql.Array a) {
            try {
                return List.of((Integer[]) a.getArray());
            } catch (Exception e) {
                return List.of();
            }
        }
        return pages instanceof List<?> l ? (List<Integer>) l : List.of();
    }

    private Integer daysUntil(Object date) {
        if (date == null) return null;
        try {
            LocalDate d = date instanceof java.sql.Date sd ? sd.toLocalDate()
                    : LocalDate.parse(String.valueOf(date).substring(0, 10));
            return (int) Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), d));
        } catch (Exception e) {
            return null;
        }
    }

    private static String label(String status) {
        return switch (status) {
            case "awaiting_check" -> "Awaiting check";
            case "running" -> "Running";
            case "discrepancies" -> "Discrepancies";
            case "to_decide" -> "To decide";
            case "clean" -> "Clean";
            case "with_authoriser" -> "With authoriser";
            default -> status;
        };
    }

    private static String nz(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    /** Stable across credits — the UI reports run progress per area. */
    private static final List<Map<String, Object>> AREAS = List.of(
            Map.of("id", "gate", "name", "Before anything is read", "kind", "main", "wave", 0,
                    "purpose", "Hard checks that can end the examination", "checkIds", List.of()),
            Map.of("id", "a1", "name", "Time & availability", "kind", "domain", "wave", 1,
                    "purpose", "Expiry, shipment and presentation windows", "checkIds", List.of()),
            Map.of("id", "a2", "name", "Transport", "kind", "domain", "wave", 1,
                    "purpose", "How the goods moved and what proves it", "checkIds", List.of()),
            Map.of("id", "a3", "name", "Amounts & goods", "kind", "domain", "wave", 1,
                    "purpose", "What was invoiced against what was called for", "checkIds", List.of()),
            Map.of("id", "a4", "name", "Insurance", "kind", "domain", "wave", 2,
                    "purpose", "Cover, currency and the risks named", "checkIds", List.of()),
            Map.of("id", "a5", "name", "Documents & parties", "kind", "domain", "wave", 2,
                    "purpose", "The set presented and who signed it", "checkIds", List.of()),
            Map.of("id", "credit", "name", "This credit's own conditions", "kind", "policy", "wave", 3,
                    "purpose", "Read from 46A and 47A during the run", "checkIds", List.of()));
}
