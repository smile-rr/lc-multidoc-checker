package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.harness.doc.DocumentConverter;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.infra.blob.BlobOwner;
import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.pipeline.Stage;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
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
    private final SwiftReader swift;
    private final CreditReader creditReader;
    private final CaseStore cases;

    public IntakeStage(BlobStore blobs, DocumentConverter converter, PageRenderer renderer,
                       SwiftReader swift, CreditReader creditReader, CaseStore cases) {
        this.blobs = blobs;
        this.converter = converter;
        this.renderer = renderer;
        this.swift = swift;
        this.creditReader = creditReader;
        this.cases = cases;
    }

    @Override
    public StageId id() {
        return StageId.INTAKE;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of(CREDIT, "Reading the credit",
                        ctx -> row(ctx).creditTextSha() != null, this::readCredit),
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
     */
    public void receive(String caseId, byte[] creditText, String creditName,
                        byte[] bundle, String bundleName, String bundleType) {

        Map<String, Object> patch = new LinkedHashMap<>();

        if (creditText != null && creditText.length > 0) {
            var stored = blobs.put(creditText, "text/plain", creditName);
            blobs.reference(stored.sha256(), BlobOwner.CASE, caseId, "credit");
            patch.put("credit_text_sha", stored.sha256());

            // A placeholder document, so the intake screen has the filename to show while
            // the message behind it is still being read. It carries no reading of the
            // credit — everything below `fileName` is filled in by execute().
            cases.upsertDocument(caseId, "mt700", Rows.of(
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
        patch.put("status", "running");
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
     */
    private StepResult readCredit(StageContext ctx) {
        String caseId = ctx.caseId();
        String creditSha = row(ctx).creditTextSha();
        byte[] bytes = blobs.get(creditSha).orElseThrow(
                () -> new IllegalStateException("Credit blob " + creditSha + " is missing"));

        SwiftMessage message = swift.read(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
        Map<String, Object> credit = creditReader.read(message);

        // An amendment changes terms rather than establishing them, so only what it
        // actually states is written — CreditReader has already dropped the rest, and a
        // field absent from a 707 means "unchanged", never "cleared".
        cases.patchCase(caseId, CreditColumns.of(credit));

        // No fileName: the upsert leaves file_name alone on conflict, so the name recorded
        // at receive survives this and every rerun after it. The upload is the only thing
        // that knows what the file was called.
        cases.upsertDocument(caseId, "mt700", Rows.of(
                "role", "credit",
                "docType", message.type().isCredit() ? "Letter of credit" : message.type().label(),
                "abbr", message.type().isCredit() ? "LC" : message.type().code(),
                "icon", "file-text",
                "reference", String.valueOf(credit.getOrDefault("creditRef", "")),
                "extraction", "text", "ordinal", 0));

        return StepResult.done(message.type().label() + " read", Map.of(
                "messageType", message.type().code(),
                "messageLabel", message.type().label(),
                "tags", message.tags(),
                "credit", credit,
                "lines", message.lines()));
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

    private StepResult markReady(StageContext ctx) {
        cases.patchCase(ctx.caseId(), Map.of("status", "awaiting_check"));
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

    /** The filename recorded at receive, so re-upserting the document does not lose it. */
    private String documentName(String caseId, String docCode) {
        return cases.documents(caseId).stream()
                .filter(d -> docCode.equals(d.docCode()))
                .findFirst().map(ReadRows.Document::fileName).orElse(null);
    }
}
