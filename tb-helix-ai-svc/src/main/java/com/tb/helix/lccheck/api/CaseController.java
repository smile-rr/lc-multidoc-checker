package com.tb.helix.lccheck.api;

import com.tb.helix.infra.stream.EventStream;
import com.tb.helix.lccheck.api.dto.DecisionRequest;
import com.tb.helix.lccheck.api.dto.NewCheckRequest;
import com.tb.helix.lccheck.api.dto.SignoffRequest;
import com.tb.helix.lccheck.pipeline.PipelineService;
import com.tb.helix.lccheck.service.CaseService;
import com.tb.helix.lccheck.types.CaseDetail;
import com.tb.helix.lccheck.types.CaseSummary;
import com.tb.helix.lccheck.types.StageId;
import com.tb.helix.lccheck.types.examination.PlanCheckView;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * The lc-check HTTP surface.
 *
 * <p>Routing, status codes, and nothing else. Every method here is a line or two: the work
 * is {@link CaseService}'s and the shapes are the domain's, so this class says what the API
 * is without also saying how any of it works.
 *
 * <p>Failures are not caught. Each typed exception already knows its own status, and
 * {@code ApiExceptionHandler} turns it into a response in one place — a controller that
 * translated its own would be the second opinion on what a 404 means.
 */
@RestController
@RequestMapping("/api/v1/lc-check")
public class CaseController {

    private final CaseService cases;
    private final PipelineService pipeline;
    private final EventStream stream;

    public CaseController(CaseService cases, PipelineService pipeline, EventStream stream) {
        this.cases = cases;
        this.pipeline = pipeline;
        this.stream = stream;
    }

    /**
     * The examination itself: every stage, its steps, and who starts each one.
     *
     * <p>Not per-case — this is the shape of the process, not the state of one run. The
     * browser reads it once and stops hard-coding a copy of the pipeline it can only get
     * wrong.
     */
    @GetMapping("/flow")
    public List<Map<String, Object>> flow() {
        return pipeline.pipeline().describe();
    }

    // --- Cases --------------------------------------------------------------

    @GetMapping("/cases")
    public List<CaseSummary> list(@RequestParam(defaultValue = "all") String scope,
                                  @RequestParam(defaultValue = "officer") String officerId) {
        return cases.list(scope, officerId);
    }

    @PostMapping(value = "/cases", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> create(@RequestPart(value = "credit", required = false) MultipartFile credit,
                                      @RequestPart(value = "bundle", required = false) MultipartFile bundle,
                                      @RequestParam(defaultValue = "officer") String officerId) throws IOException {
        return cases.create(
                credit == null ? null : credit.getBytes(),
                credit == null ? null : credit.getOriginalFilename(),
                bundle == null ? null : bundle.getBytes(),
                bundle == null ? null : bundle.getOriginalFilename(),
                bundle == null ? null : bundle.getContentType(),
                officerId);
    }

    /** What the credit says before a case exists — shown as soon as the MT700 is dropped. */
    @PostMapping(value = "/cases/peek", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<Map<String, String>> peek(@RequestPart("credit") MultipartFile credit) throws IOException {
        return cases.peek(credit.getBytes());
    }

    @GetMapping("/cases/{ref}")
    public CaseDetail detail(@PathVariable String ref) {
        return cases.detail(ref);
    }

    // --- Documents ----------------------------------------------------------

    @GetMapping("/cases/{ref}/bundle.pdf")
    public ResponseEntity<byte[]> bundle(@PathVariable String ref) {
        return pdf(cases.bundlePdf(ref));
    }

    @GetMapping("/cases/{ref}/documents/{docCode}/pdf")
    public ResponseEntity<byte[]> document(@PathVariable String ref, @PathVariable String docCode) {
        return pdf(cases.documentPdf(ref, docCode));
    }

    // --- Running ------------------------------------------------------------

    @PostMapping("/cases/{ref}/stages/{stage}/run")
    public Map<String, Object> run(@PathVariable String ref, @PathVariable String stage,
                                   @RequestParam(defaultValue = "officer") String officerId) {
        pipeline.runStage(cases.resolve(ref), cases.stage(stage), officerId);
        return Map.of("started", stage);
    }

    @PostMapping("/cases/{ref}/stages/{stage}/rerun")
    public Map<String, Object> rerun(@PathVariable String ref, @PathVariable String stage,
                                     @RequestParam(defaultValue = "officer") String officerId) {
        pipeline.rerunStage(cases.resolve(ref), cases.stage(stage), officerId);
        return Map.of("rerunning", stage);
    }

    /**
     * Progress, live.
     *
     * <p>{@code Last-Event-ID} is the browser's own reconnect header — honouring it means a
     * dropped connection replays what it missed instead of showing a run that appears to
     * have done nothing.
     */
    @GetMapping(value = "/cases/{ref}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamCase(@PathVariable String ref,
                                 @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        return stream.subscribe(cases.resolve(ref), lastEventId == null ? 0 : Long.parseLong(lastEventId));
    }

    // --- Officer decisions --------------------------------------------------

    @PostMapping("/cases/{ref}/findings/{findingRef}/decision")
    public Map<String, Object> decide(@PathVariable String ref, @PathVariable String findingRef,
                                      @RequestBody DecisionRequest body,
                                      @RequestParam(defaultValue = "officer") String officerId) {
        cases.decide(ref, findingRef, body.disposition(), body.note(), officerId);
        return Map.of("recorded", true);
    }

    @PostMapping("/cases/{ref}/checks")
    public PlanCheckView addCheck(@PathVariable String ref, @RequestBody NewCheckRequest body,
                                  @RequestParam(defaultValue = "officer") String officerId) {
        return cases.addCheck(ref, body.name(), officerId);
    }

    @PostMapping("/cases/{ref}/signoff")
    public Map<String, Object> signoff(@PathVariable String ref, @RequestBody SignoffRequest body,
                                       @RequestParam(defaultValue = "officer") String officerId) {
        String caseId = cases.signoff(ref, body.verdict(), body.note(), officerId);
        pipeline.runStage(caseId, StageId.SIGNOFF, officerId);
        return Map.of("routedTo", cases.routedTo(caseId));
    }

    @GetMapping(value = "/cases/{ref}/mt734", produces = MediaType.TEXT_PLAIN_VALUE)
    public String mt734(@PathVariable String ref) {
        return cases.mt734(ref);
    }

    private ResponseEntity<byte[]> pdf(java.util.Optional<byte[]> bytes) {
        return bytes.map(b -> ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(b))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
