package com.tb.helix.lccheck.api;

import com.tb.helix.infra.cost.ModelCallLog;
import com.tb.helix.infra.stream.EventStream;
import com.tb.helix.lccheck.api.dto.OutcomeOverrideRequest;
import com.tb.helix.lccheck.api.dto.NewCheckRequest;
import com.tb.helix.lccheck.api.dto.SignoffRequest;
import com.tb.helix.lccheck.pipeline.DocCheckPipeline;
import com.tb.helix.lccheck.pipeline.StageLauncher;
import com.tb.helix.lccheck.service.CaseService;
import com.tb.helix.lccheck.types.CaseDetail;
import com.tb.helix.lccheck.types.CaseSummary;
import com.tb.helix.lccheck.types.examination.PlanCheckView;
import com.tb.helix.lccheck.types.pipeline.StageId;

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
    private final DocCheckPipeline pipeline;
    private final StageLauncher runner;
    private final EventStream stream;
    private final ModelCallLog calls;

    // Two collaborators, because they answer two questions. The pipeline is what an
    // examination *is* — asked once, the same answer for every case. The runner is one case
    // being examined. This used to reach the first through the second, which made them read
    // like one thing with a spare accessor.
    public CaseController(CaseService cases, DocCheckPipeline pipeline,
                          StageLauncher runner, EventStream stream,
                          ModelCallLog calls) {
        this.cases = cases;
        this.pipeline = pipeline;
        this.runner = runner;
        this.stream = stream;
        this.calls = calls;
    }

    /**
     * The pipeline: every stage, its steps, and who starts each one.
     *
     * <p>Not per-case — this is the shape of the process, not the state of one run. The
     * browser reads it once and stops hard-coding a copy it can only get wrong.
     */
    @GetMapping("/pipeline")
    public List<Map<String, Object>> pipeline() {
        return pipeline.describe();
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
        runner.runStage(cases.resolve(ref), cases.stage(stage), officerId);
        return Map.of("started", stage);
    }

    @PostMapping("/cases/{ref}/stages/{stage}/rerun")
    public Map<String, Object> rerun(@PathVariable String ref, @PathVariable String stage,
                                     @RequestParam(defaultValue = "officer") String officerId) {
        runner.rerunStage(cases.resolve(ref), cases.stage(stage), officerId);
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

    /**
     * Progress, after the fact.
     *
     * <p>What the stream would have told you had you been watching. A case is examined over
     * minutes and read over days, so the run has to be legible to somebody who arrives after
     * it — asking why a stage took ninety seconds is a question people ask about finished
     * work far more often than about work in flight.
     *
     * <p>Same rows as the stream, so a panel opened mid-run fills from here and continues
     * from there without two ways of holding an event.
     */
    @GetMapping("/cases/{ref}/events")
    public List<Map<String, Object>> events(@PathVariable String ref,
                                            @RequestParam(defaultValue = "0") long after) {
        return stream.history(cases.resolve(ref), after);
    }

    /**
     * What every examination has spent lately.
     *
     * <p>Real numbers or none. This panel was a fixture in both mock and API mode, which on
     * a screen headed with a cost is worse than an empty one — a made-up figure that looks
     * authoritative gets acted on.
     */
    @GetMapping("/metrics/spend")
    public Map<String, Object> metricsSpend(@RequestParam(defaultValue = "30d") String period) {
        int days = period.endsWith("d")
                ? Integer.parseInt(period.substring(0, period.length() - 1)) : 30;
        java.time.Instant since = java.time.Instant.now().minus(java.time.Duration.ofDays(days));
        Map<String, Object> out = new java.util.LinkedHashMap<>(calls.spendSince(since));
        // Two halves, joined here: what the models cost, and what the examinations did.
        // Neither side reaches into the other's tables to get it.
        // Ordered so the examination half wins any key both sides answer: `medianWallClock`
        // is time to findings, which the stage spans measure, and the ledger's
        // `medianCaseSeconds` is the model time inside it — a smaller number, and a
        // different question.
        out.putAll(cases.portfolio(since));
        return out;
    }

    /**
     * What this examination spent, by model.
     *
     * <p>Priced at read time from the family book, never stored: rates change, and a total
     * written down at the time is a number that stops matching the rate behind it without
     * ever saying so.
     */
    @GetMapping("/cases/{ref}/spend")
    public List<Map<String, Object>> spend(@PathVariable String ref) {
        return calls.spendForCase(cases.resolve(ref));
    }

    // --- Officer decisions --------------------------------------------------

    /**
     * Release a hard check's halt. The finding it raised stays where it is.
     */
    @PostMapping("/cases/{ref}/gate/override")
    public Map<String, Object> overrideGate(@PathVariable String ref,
                                            @RequestBody(required = false) OutcomeOverrideRequest body,
                                            @RequestParam(defaultValue = "officer") String officerId) {
        cases.overrideGate(ref, body == null ? null : body.note(), officerId);
        return Map.of("overridden", true);
    }

    /** The officer overruling the engine on one finding. Appends; never overwrites. */
    @PostMapping("/cases/{ref}/findings/{findingRef}/outcome")
    public Map<String, Object> override(@PathVariable String ref, @PathVariable String findingRef,
                                        @RequestBody OutcomeOverrideRequest body,
                                        @RequestParam(defaultValue = "officer") String officerId) {
        cases.override(ref, findingRef, body.outcome(), body.by(), body.note(), officerId);
        return Map.of("recorded", true);
    }

    /**
     * Withdrawing an override, so the engine's own outcome stands again.
     *
     * <p>A DELETE on the wire and an append underneath — that somebody disagreed and then
     * thought better of it is exactly the kind of thing the file is kept for.
     */
    @DeleteMapping("/cases/{ref}/findings/{findingRef}/outcome")
    public Map<String, Object> clearOverride(@PathVariable String ref, @PathVariable String findingRef,
                                             @RequestParam(defaultValue = "officer") String officerId) {
        cases.clearOverride(ref, findingRef, officerId);
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
        String caseId = cases.signoff(ref, body.status(), body.note(), officerId);
        runner.runStage(caseId, StageId.SIGNOFF, officerId);
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
