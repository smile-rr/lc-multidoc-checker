package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.harness.doc.CreditMaterial;
import com.tb.helix.harness.doc.CreditTextExtractor;
import com.tb.helix.harness.doc.DocumentConverter;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.infra.blob.BlobOwner;
import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.error.DocumentException;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.pipeline.Trigger;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.pipeline.Stage;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.service.ExtractionSpec;
import com.tb.helix.lccheck.service.FactWriter;
import com.tb.helix.lccheck.types.CaseStatus;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * What arrived, made usable.
 *
 * <p>The only stage that runs by itself. It stores the originals, converts a TIFF bundle to
 * the PDF everything downstream assumes, and reads the credit — so that by the time the
 * officer looks at the case, the terms are on screen and nothing has been examined.
 *
 * <p>The uploads are stored <em>before</em> anything is done to them. A conversion is an
 * interpretation; the file the beneficiary presented is the evidence.
 *
 * <p><b>Two halves, and the split is the point.</b> {@link #receive} writes the bytes and
 * returns — a few milliseconds, and the case now exists with its evidence on disk.
 * {@link #execute} reads the credit through a model and converts the bundle, which takes
 * seconds, and runs on the pipeline's own thread reporting progress as it goes.
 *
 * <p>Doing both on the upload request was the obvious first version and it was wrong in a
 * way that only shows on a cold credit: the browser holds a dialog open for the length of a
 * model call, then lands on a workbench whose case has no documents in it yet. The officer
 * sees a stall and then an empty screen, and neither says what is happening.
 */
@Component
public class IntakeStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(IntakeStage.class);

    /**
     * Step keys, published because other code reads their results back.
     *
     * <p>A key is a contract the moment anything looks it up — {@code CaseAssembler} wants
     * the credit's tag lines, {@code PlanStage} wants its {@code :46A:}/{@code :47A:} text.
     * Naming the constant rather than repeating the string is what stops a renamed step
     * from silently returning nothing: this file is the one definition, and a rename here
     * fails to compile everywhere it matters.
     */
    public static final String CREDIT = "credit";
    public static final String BUNDLE = "bundle";
    public static final String MANIFEST = "manifest";
    public static final String READY = "ready";


    private final BlobStore blobs;
    private final DocumentConverter converter;
    private final PageRenderer renderer;
    private final CreditTextExtractor creditText;
    private final CreditScanTranscriber scanTranscriber;
    private final SwiftReader swift;
    private final CreditReader creditReader;
    private final CaseStore cases;
    private final DocumentTypes docTypes;
    private final ExtractionSpec spec;

    public IntakeStage(BlobStore blobs, DocumentConverter converter, PageRenderer renderer,
                       CreditTextExtractor creditText, CreditScanTranscriber scanTranscriber,
                       SwiftReader swift, CreditReader creditReader, CaseStore cases,
                       DocumentTypes docTypes, ExtractionSpec spec) {
        this.blobs = blobs;
        this.converter = converter;
        this.renderer = renderer;
        this.creditText = creditText;
        this.scanTranscriber = scanTranscriber;
        this.swift = swift;
        this.creditReader = creditReader;
        this.cases = cases;
        this.docTypes = docTypes;
        this.spec = spec;
    }

    @Override
    public StageId id() {
        return StageId.INTAKE;
    }

    /** Runs the moment files arrive. Nobody asks for intake; it is what an upload is. */
    @Override
    public Trigger trigger() {
        return Trigger.AUTOMATIC;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of(CREDIT, "Reading the credit",
                        ctx -> row(ctx).creditTextSha() != null || row(ctx).creditSourceSha() != null,
                        this::readCredit),
                Step.<StageContext>of(BUNDLE, "Converting the scan to PDF",
                        ctx -> row(ctx).sourceBundleSha() != null && row(ctx).bundlePdfSha() == null,
                        this::convertBundle),
                Step.<StageContext>of(MANIFEST, "Counting the pages",
                        ctx -> row(ctx).sourceBundleSha() != null, this::countPages),
                Step.<StageContext>of(READY, "Finishing intake", this::markReady));
    }

    /**
     * Takes custody of the uploads. Nothing is read, nothing is converted, nothing is
     * spent — this is only the point past which the evidence cannot be lost.
     *
     * <p>Called directly on the upload request rather than through the pipeline, because
     * the bytes are in hand and writing them to a blob store only to read them back would
     * be ceremony. It must stay fast: a person is waiting on it with a dialog open.
     *
     * <p>A bundle that arrives as a PDF is usable immediately, so its sha is recorded as
     * the bundle's here and the viewer can open it while the credit is still being read. A
     * TIFF has to wait for the conversion, which is {@link #execute}'s.
     *
     * <p>A credit may arrive as plain text, a text-layer PDF, a Word file, or a scan.
     * The original bytes are always kept under {@code credit_source_sha}. When the text
     * layer is usable, {@code credit_text_sha} is filled here; a scan leaves it empty and
     * {@link #readCredit} transcribes the pages with vision before the SWIFT reader runs.
     * Either way, everything after this method sees UTF-8 SWIFT text.
     */
    public void receive(String caseId, byte[] creditBytes, String creditName,
                        byte[] bundle, String bundleName, String bundleType) {

        Map<String, Object> patch = new LinkedHashMap<>();

        if (creditBytes != null && creditBytes.length > 0) {
            // The upload as received — evidence. A scan still needs these bytes on the
            // pipeline thread; a text dump keeps them so a rerun can show what arrived.
            var source = blobs.put(creditBytes, creditMediaType(creditName), creditName);
            blobs.reference(source.sha256(), BlobOwner.CASE, caseId, "credit_source");
            patch.put("credit_source_sha", source.sha256());

            CreditMaterial material = creditText.materialize(creditBytes, creditName);
            switch (material) {
                case CreditMaterial.PlainText plain -> {
                    byte[] utf8 = plain.text().getBytes(StandardCharsets.UTF_8);
                    var stored = blobs.put(utf8, "text/plain", creditName);
                    blobs.reference(stored.sha256(), BlobOwner.CASE, caseId, "credit");
                    patch.put("credit_text_sha", stored.sha256());
                }
                case CreditMaterial.ScannedPdf ignored -> {
                    // credit_text_sha stays null until readCredit transcribes.
                    log.info("Case {}: credit looks like a scan — vision will read it in intake",
                            caseId);
                }
            }

            // A placeholder document, so the intake screen has the filename to show while
            // the message behind it is still being read. It carries no reading of the
            // credit — everything below `fileName` is filled in by execute().
            cases.upsertDocument(caseId, docTypes.creditCode(), Rows.of(
                    "role", "credit", "docType", "Letter of credit", "abbr", "LC",
                    "icon", "file-text", "fileName", creditName,
                    "extraction", "text", "ordinal", 0));
        }

        if (bundle != null && bundle.length > 0) {
            var source = blobs.put(bundle, bundleType, bundleName);
            blobs.reference(source.sha256(), BlobOwner.CASE, caseId, "source");
            patch.put("source_bundle_sha", source.sha256());

            if (!needsConversion(bundleName, bundleType)) {
                blobs.reference(source.sha256(), BlobOwner.CASE, caseId, "bundle");
                patch.put("bundle_pdf_sha", source.sha256());
            }
        }

        patch.put("presented_date", java.sql.Date.valueOf(LocalDate.now()));
        // Fourteen days is UCP 600 art. 16(d)'s ceiling for a refusal notice. A real
        // deployment sets this from the bank's own service standard; it is a default, not
        // a rule, and it exists so the list view has something honest to count down.
        patch.put("reply_due_date", java.sql.Date.valueOf(LocalDate.now().plusDays(5)));
        patch.put("status", CaseStatus.RUNNING.key());
        cases.patchCase(caseId, patch);
        // Deliberately not awaiting the officer: reading has not finished, and a case that
        // offered its next stage now would be offering to examine a bundle nobody has
        // opened yet.
        cases.setStage(caseId, StageId.INTAKE, StageId.INTAKE, false);
    }

    /**
     * Reads what was received.
     *
     * <p>Everything slow lives here — a model call for the credit, a page-by-page
     * conversion for a TIFF — and each part reports before it starts, because the officer
     * is watching the screen it fills in.
     *
     * <p>A rerun re-reads from the stored blobs rather than from an upload, which is what
     * makes intake repeatable at all: the bytes are the input, and they are still there.
     */

    /**
     * Reads the credit through a model and writes its terms.
     *
     * <p>Written before the bundle is touched, so the terms are on screen while the scan is
     * still converting — which is the whole reason this is four steps rather than one.
     *
     * <p>A scanned PDF has no {@code credit_text_sha} yet: the pages are transcribed here,
     * once, then the ordinary SWIFT → terms path runs on the resulting text.
     */
    private StepResult readCredit(StageContext ctx) {
        String caseId = ctx.caseId();
        CaseRow caseRow = row(ctx);
        boolean transcribed = false;

        String creditSha = caseRow.creditTextSha();
        if (creditSha == null) {
            String sourceSha = caseRow.creditSourceSha();
            if (sourceSha == null) {
                throw new DocumentException("No credit was uploaded for this case.");
            }
            String plain = scanTranscriber.transcribe(sourceSha);
            var stored = blobs.put(plain.getBytes(StandardCharsets.UTF_8), "text/plain", "lc-transcribed.txt");
            blobs.reference(stored.sha256(), BlobOwner.CASE, caseId, "credit");
            cases.patchCase(caseId, Map.of("credit_text_sha", stored.sha256()));
            creditSha = stored.sha256();
            transcribed = true;
            log.info("Case {}: transcribed scanned credit → {}", caseId, stored.shortSha());
        }

        final String textSha = creditSha;
        byte[] bytes = blobs.get(textSha).orElseThrow(
                () -> new IllegalStateException("Credit blob " + textSha + " is missing"));

        SwiftFile file = swift.read(new String(bytes, StandardCharsets.UTF_8));
        CreditReader.Reading reading = creditReader.read(file);

        // The terms as they now stand — the model has already applied every amendment in
        // the file and dropped what none of the messages carries. A field it omits is left
        // alone here, because absent means "the credit does not say", never "cleared".
        cases.patchCase(caseId, CreditColumns.of(reading.terms()));

        // No fileName: the upsert leaves file_name alone on conflict, so the name recorded
        // at receive survives this and every rerun after it. The upload is the only thing
        // that knows what the file was called.
        cases.upsertDocument(caseId, docTypes.creditCode(), Rows.of(
                "role", "credit",
                "docType", file.label(),
                "abbr", file.hasCredit() ? "LC" : file.messages().get(0).type().code(),
                "icon", "file-text",
                "reference", String.valueOf(reading.terms().getOrDefault("creditRef", "")),
                "extraction", "text", "ordinal", 0));

        writeCreditFacts(caseId, reading);

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("messages", file.manifest());
        detail.put("credit", reading.terms());
        detail.put("from", reading.provenance());
        detail.put("lines", file.lines());
        if (transcribed) detail.put("transcribed", true);

        return StepResult.done(file.label() + " read", detail);
    }

    /**
     * The credit's terms, as facts.
     *
     * <p>The columns on {@code lc_case} are a summary — thirteen of them, denormalised so the
     * cases list is one query — and a rule cannot cite a column. Writing the reading as facts
     * as well means every operand an author can express is the same shape:
     * {@code (field_key, doc_code)}, whether it reads the credit or the invoice. Before this,
     * a rule comparing the invoice value to the credit amount had a fact on one side and a
     * column on the other, and no way to say so.
     *
     * <p>The anchor is what makes the reading checkable: a fact read from tag 31D points at
     * that line, and the viewer highlights it. On an amended credit the anchor names the
     * message the value actually came from.
     */
    private void writeCreditFacts(String caseId, CreditReader.Reading reading) {
        String docCode = docTypes.creditCode();
        for (var fact : spec.read(docCode, reading.terms()).values()) {
            Object from = reading.provenance().get(fact.key());
            cases.upsertFact(caseId, Rows.of(
                    "docId", docCode,
                    "label", fact.label(),
                    "fieldKey", fact.key(),
                    "value", String.valueOf(fact.value()),
                    "valueNorm", String.valueOf(fact.value()).strip().toUpperCase(),
                    // Which message stated it, when the file held more than one. "#1 MT700"
                    // is the credit as issued; "#3 MT707" is an amendment, and an examiner
                    // reading a term that moved wants to know that without being told twice.
                    "source", from == null ? "the credit" : String.valueOf(from),
                    "flag", fact.known() ? null : FactWriter.OFF_DICTIONARY,
                    "confidence", "HIGH"));
        }
    }

    /**
     * A TIFF becomes the PDF everything downstream assumes.
     *
     * <p>Skipped when {@code receive} already set the bundle sha, which it does for a PDF
     * upload — and after a conversion, which is what makes a rerun cheap.
     */
    private StepResult convertBundle(StageContext ctx) {
        CaseRow row = row(ctx);
        var pdf = converter.toPdf(row.sourceBundleSha());
        blobs.reference(pdf.sha256(), BlobOwner.CASE, ctx.caseId(), "bundle");
        cases.patchCase(ctx.caseId(), Map.of("bundle_pdf_sha", pdf.sha256()));
        log.info("Case {}: converted source {} to PDF {}",
                ctx.caseId(), row.sourceBundleSha().substring(0, 8), pdf.shortSha());
        return StepResult.ok(Map.of("sourceSha", row.sourceBundleSha(), "pdfSha", pdf.sha256()));
    }

    private StepResult countPages(StageContext ctx) {
        CaseRow row = row(ctx);
        String pdfSha = row.bundlePdfSha();
        int pages = renderer.pageCount(pdfSha);
        cases.patchCase(ctx.caseId(), Map.of("page_count", pages));
        return StepResult.ok(Map.of(
                "sourceSha", row.sourceBundleSha(), "pdfSha", pdfSha,
                "converted", !pdfSha.equals(row.sourceBundleSha()), "pages", pages));
    }

    /**
     * Finishes intake, and records when the presentation arrived.
     *
     * <p>The date the documents reached us, written as a fact on the covering schedule so a
     * rule can read it. The presenting bank's own stated date governs and replaces this the
     * moment the schedule is read — same document, same field, so the reading wins.
     *
     * <p>It was a fallback inside the gate: "read the schedule when the bank stated one,
     * otherwise use the date we received the file". That is a sound rule and it was
     * invisible, living in Java where no author could see it and no rule could express it.
     * As a fact it is on screen with its source beside it, and an officer can see the
     * examination is standing on our clock rather than the bank's.
     */
    private StepResult markReady(StageContext ctx) {
        CaseRow row = row(ctx);
        String schedule = docTypes.scheduleCode();
        if (row.presentedDate() != null && !DocumentTypes.UNKNOWN.equals(schedule)) {
            cases.upsertFact(ctx.caseId(), Rows.of(
                    "docId", schedule,
                    "label", "Presentation date",
                    "fieldKey", "presentation_date",
                    "value", row.presentedDate().toString(),
                    "valueNorm", row.presentedDate().toString(),
                    "source", "the date this presentation was received",
                    "flag", "Taken from our records — the covering schedule has not stated one",
                    "confidence", "MED"));
        }
        return StepResult.done("Ready to examine");
    }

    private CaseRow row(StageContext ctx) {
        return cases.find(ctx.caseId()).orElseThrow();
    }

    /** A TIFF has to become a PDF; anything else is already what the viewer wants. */
    private boolean needsConversion(String fileName, String mediaType) {
        return converter.needsConversion(mediaType)
                || (fileName != null && fileName.toLowerCase().matches(".*\\.tiff?$"));
    }

    private static String creditMediaType(String fileName) {
        if (fileName == null) return "application/octet-stream";
        String n = fileName.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".docx")) {
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        if (n.endsWith(".txt") || n.endsWith(".swift")) return "text/plain";
        return "application/octet-stream";
    }

    /** The filename recorded at receive, so re-upserting the document does not lose it. */
    private String documentName(String caseId, String docCode) {
        return cases.documents(caseId).stream()
                .filter(d -> docCode.equals(d.docCode()))
                .findFirst().map(ReadRows.Document::fileName).orElse(null);
    }
}
