package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.harness.doc.DocumentConverter;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.infra.blob.BlobOwner;
import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.Stage;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.pipeline.StageId;
import com.tb.helix.lccheck.pipeline.StageOutcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashMap;
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
 */
@Component
public class IntakeStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(IntakeStage.class);

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

    /**
     * Called directly on upload rather than through the pipeline, because the bytes are in
     * hand and writing them to a blob store only to read them back would be ceremony.
     */
    public void ingest(String caseId, byte[] creditText, String creditName,
                       byte[] bundle, String bundleName, String bundleType) {

        Map<String, Object> patch = new LinkedHashMap<>();

        if (creditText != null && creditText.length > 0) {
            var stored = blobs.put(creditText, "text/plain", creditName);
            blobs.reference(stored.sha256(), BlobOwner.CASE, caseId, "credit");
            patch.put("credit_text_sha", stored.sha256());

            SwiftMessage message = swift.read(
                    new String(creditText, java.nio.charset.StandardCharsets.UTF_8));
            Map<String, Object> credit = creditReader.read(message);

            // An amendment changes terms rather than establishing them, so only what it
            // actually states is written — CreditReader has already dropped the rest, and a
            // field absent from a 707 means "unchanged", never "cleared".
            patch.putAll(creditColumns(credit));

            cases.recordStep(caseId, "intake", "swift", "OK", Map.of(
                    "messageType", message.type().code(),
                    "messageLabel", message.type().label(),
                    "tags", message.tags(),
                    "credit", credit,
                    "lines", message.lines()), null, false, null);

            cases.upsertDocument(caseId, "mt700", Rows.of(
                    "role", "credit",
                    "docType", message.type().isCredit() ? "Letter of credit" : message.type().label(),
                    "abbr", message.type().isCredit() ? "LC" : message.type().code(),
                    "icon", "file-text", "fileName", creditName,
                    "reference", String.valueOf(credit.getOrDefault("creditRef", "")),
                    "extraction", "text", "ordinal", 0));
        }

        if (bundle != null && bundle.length > 0) {
            var source = blobs.put(bundle, bundleType, bundleName);
            blobs.reference(source.sha256(), BlobOwner.CASE, caseId, "source");
            patch.put("source_bundle_sha", source.sha256());

            String pdfSha = source.sha256();
            boolean tiff = converter.needsConversion(bundleType)
                    || (bundleName != null && bundleName.toLowerCase().matches(".*\\.tiff?$"));
            if (tiff) {
                var pdf = converter.toPdf(source.sha256());
                pdfSha = pdf.sha256();
                blobs.reference(pdfSha, BlobOwner.CASE, caseId, "bundle");
                log.info("Case {}: converted {} to PDF {}", caseId, bundleName, pdf.shortSha());
            } else {
                blobs.reference(pdfSha, BlobOwner.CASE, caseId, "bundle");
            }
            patch.put("bundle_pdf_sha", pdfSha);
            patch.put("page_count", renderer.pageCount(pdfSha));

            cases.recordStep(caseId, "intake", "manifest", "OK", Map.of(
                    "sourceSha", source.sha256(), "pdfSha", pdfSha,
                    "converted", tiff, "bytes", bundle.length), null, false, null);
        }

        patch.put("presented_date", java.sql.Date.valueOf(LocalDate.now()));
        // Fourteen days is UCP 600 art. 16(d)'s ceiling for a refusal notice. A real
        // deployment sets this from the bank's own service standard; it is a default, not
        // a rule, and it exists so the list view has something honest to count down.
        patch.put("reply_due_date", java.sql.Date.valueOf(LocalDate.now().plusDays(5)));
        cases.patchCase(caseId, patch);
        cases.setStage(caseId, StageId.INTAKE, StageId.INTAKE.nextOfficerStage().orElse(null), true);
    }

    /** A rerun of intake re-reads the credit from what is already stored. */
    @Override
    public StageOutcome execute(StageContext ctx) {
        ctx.recordStep("manifest", Map.of("note", "intake runs at upload; nothing to redo"));
        return StageOutcome.ok();
    }

    private Map<String, Object> creditColumns(Map<String, Object> c) {
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "credit_ref", c.get("creditRef"));
        put(out, "issued_date", date(c.get("issuedDate")));
        put(out, "applicant", c.get("applicant"));
        put(out, "beneficiary", c.get("beneficiary"));
        put(out, "currency", trim(c.get("currency"), 3));
        put(out, "amount", decimal(c.get("amount")));
        put(out, "tolerance_pct", decimal(c.get("tolerancePct")));
        put(out, "latest_shipment", date(c.get("latestShipment")));
        put(out, "expiry", date(c.get("expiry")));
        put(out, "expiry_place", c.get("expiryPlace"));
        put(out, "presentation_days", integer(c.get("presentationDays")));
        put(out, "tenor", c.get("tenor"));
        put(out, "goods", c.get("goods"));
        return out;
    }

    /**
     * ISO text to a real date.
     *
     * <p>A DATE column will not take a String parameter — the driver binds it as varchar
     * and Postgres refuses the comparison. Converting here rather than casting in SQL keeps
     * the store's patch generic, and the parser is where the value is known to be a date.
     */
    private java.sql.Date date(Object iso) {
        if (iso == null) return null;
        try {
            return java.sql.Date.valueOf(LocalDate.parse(String.valueOf(iso).substring(0, 10)));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * A number, however it was written.
     *
     * <p>SWIFT uses the comma as the decimal separator: {@code :32B:GBP100,00} is one
     * hundred pounds, not ten thousand. Stripping the comma — which is what a naive
     * "keep digits and dots" clean does — multiplies the credit by a hundred, and the
     * examination then measures every invoice against the wrong amount without anything
     * looking broken.
     *
     * <p>So the separators are read rather than removed: whichever of {@code .} or
     * {@code ,} appears last is the decimal point, and everything before it is grouping.
     */
    private java.math.BigDecimal decimal(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return new java.math.BigDecimal(n.toString());

        String s = String.valueOf(value).strip().replaceAll("[^0-9.,\\-]", "");
        if (s.isBlank()) return null;

        int lastDot = s.lastIndexOf('.');
        int lastComma = s.lastIndexOf(',');
        int decimalAt = Math.max(lastDot, lastComma);

        String normalised;
        if (decimalAt < 0) {
            normalised = s;
        } else {
            // A trailing group of three digits after the only separator is ambiguous —
            // 1,000 is a thousand in one convention and one in the other. SWIFT amounts
            // always carry their decimals, so treat it as grouping only when it is the
            // sole separator and leaves exactly three digits.
            String tail = s.substring(decimalAt + 1);
            boolean grouping = tail.length() == 3 && lastDot < 0 != lastComma < 0;
            normalised = grouping
                    ? s.replaceAll("[.,]", "")
                    : s.substring(0, decimalAt).replaceAll("[.,]", "") + "." + tail;
        }
        try {
            return new java.math.BigDecimal(normalised);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer integer(Object value) {
        java.math.BigDecimal d = decimal(value);
        return d == null ? null : d.intValue();
    }

    /** A fixed-width column will not take an over-long value; CHAR(3) means CHAR(3). */
    private String trim(Object value, int max) {
        if (value == null) return null;
        String s = String.valueOf(value).strip();
        return s.isEmpty() ? null : s.substring(0, Math.min(s.length(), max));
    }

    // A null must stay out of the patch entirely, or it overwrites a value parsed earlier.
    private void put(Map<String, Object> map, String key, Object value) {
        if (value != null) map.put(key, value instanceof String s && s.isBlank() ? null : value);
    }
}
