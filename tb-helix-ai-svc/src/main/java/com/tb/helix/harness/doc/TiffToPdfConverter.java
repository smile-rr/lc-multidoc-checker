package com.tb.helix.harness.doc;

import com.tb.helix.infra.blob.BlobOwner;
import com.tb.helix.infra.blob.BlobRef;
import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.error.DocumentException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Map;

/**
 * Multi-page TIFF to PDF.
 *
 * <p>Presentations arrive as TIFF as often as PDF, because that is what fax and scanner
 * workflows emit. Everything downstream assumes PDF — the browser's viewer renders it, the
 * page renderer reads it — so the conversion happens once at intake and nothing after it
 * needs to know which form arrived.
 *
 * <p>The JDK cannot read the TIFF variants that matter here; TwelveMonkeys teaches ImageIO
 * the CCITT Group 4 and LZW encodings that scanned bank documents actually use.
 *
 * <p><b>The original is never discarded.</b> It is stored before this runs and stays
 * stored. A conversion is an interpretation, and the thing that arrived is the evidence.
 *
 * <p>Deterministic, so the cache entry never expires: the same TIFF converts to the same
 * PDF forever, and a re-presented bundle is a lookup rather than a conversion.
 */
@Component
public class TiffToPdfConverter implements DocumentConverter {

    private static final Logger log = LoggerFactory.getLogger(TiffToPdfConverter.class);

    private final BlobStore blobs;
    private final DerivationCache cache;

    public TiffToPdfConverter(BlobStore blobs, DerivationCache cache) {
        this.blobs = blobs;
        this.cache = cache;
    }

    @Override
    public boolean needsConversion(String mediaType) {
        if (mediaType == null) return false;
        String m = mediaType.toLowerCase();
        return m.contains("tiff") || m.contains("tif");
    }

    /** What the cache stores for a conversion: the address of the PDF and its page count. */
    public record Converted(String pdfSha, int pageCount) {
    }

    @Override
    public BlobRef toPdf(String sourceSha) {
        DerivationKey key = DerivationKey.of(
                CacheOp.CONVERT_TIFF_PDF, CacheOp.CONVERT_TIFF_PDF_V, sourceSha, Map.of());

        DerivationCache.Hit<Converted> hit = cache.computeIfAbsent(key, Converted.class, () -> {
            byte[] tiff = blobs.get(sourceSha).orElseThrow(
                    () -> new DocumentException("Source not in the blob store: " + sourceSha.substring(0, 12)));

            long started = System.currentTimeMillis();
            byte[] pdf = convert(tiff);
            BlobRef stored = blobs.put(pdf, "application/pdf", "converted.pdf");
            blobs.reference(stored.sha256(), BlobOwner.DERIVATION, key.hash(), "converted_pdf");

            // The converter counted the pages on the way through, so the catalogue learns
            // it here and nothing downstream re-opens the document to ask.
            int pages = countPagesOf(pdf);
            blobs.recordPageCount(stored.sha256(), pages);

            log.info("Converted TIFF {} to PDF {} ({} pages, {} ms)",
                    sourceSha.substring(0, 12), stored.shortSha(), pages,
                    System.currentTimeMillis() - started);

            return DerivationCache.Entry.of(new Converted(stored.sha256(), pages), stored.sha256());
        });

        Converted result = hit.value();
        return blobs.exists(result.pdfSha())
                ? new BlobRef(result.pdfSha(), sizeOf(result.pdfSha()), "application/pdf",
                              result.pageCount(), "converted.pdf")
                // The catalogue remembered a conversion whose bytes are gone — a manually
                // cleaned blob directory. Recompute rather than hand back a dangling address.
                : recomputeAfterMissingBytes(sourceSha, key);
    }

    // --- The conversion itself ----------------------------------------------

    private byte[] convert(byte[] tiff) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(tiff));
             PDDocument pdf = new PDDocument()) {

            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new DocumentException(
                        "This file is not a TIFF the service can read. Re-scan it as PDF or "
                                + "uncompressed TIFF.", "tiff_unreadable", null);
            }
            ImageReader reader = readers.next();
            reader.setInput(in);

            int frames = reader.getNumImages(true);
            if (frames == 0) {
                throw new DocumentException("The TIFF holds no pages.", "tiff_empty", null);
            }

            for (int i = 0; i < frames; i++) {
                BufferedImage frame = reader.read(i);
                addPage(pdf, frame);
            }
            reader.dispose();

            stripNondeterminism(pdf);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            pdf.save(out);
            return out.toByteArray();

        } catch (DocumentException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw new DocumentException(
                    "The TIFF could not be converted: " + e.getMessage(), "tiff_convert_failed", e);
        }
    }

    /**
     * One TIFF frame becomes one PDF page, sized to the image.
     *
     * <p>The page is the image's own size in points at 72 dpi, so the PDF's geometry
     * matches the scan and no rescaling happens on the way in. Rescaling here would cost
     * legibility on the small print that examination actually turns on.
     */
    private void addPage(PDDocument pdf, BufferedImage frame) throws IOException {
        PDRectangle size = new PDRectangle(frame.getWidth(), frame.getHeight());
        PDPage page = new PDPage(size);
        pdf.addPage(page);

        // LosslessFactory keeps bitonal frames as 1-bit images rather than expanding them
        // to RGB. A CCITT G4 fax page is a few tens of kilobytes as 1-bit and several
        // megabytes as RGB, and the extra bytes carry no information a model can use.
        PDImageXObject image = LosslessFactory.createFromImage(pdf, frame);
        try (PDPageContentStream content = new PDPageContentStream(pdf, page)) {
            content.drawImage(image, 0, 0, size.getWidth(), size.getHeight());
        }
    }

    /**
     * Makes the output byte-identical for identical input.
     *
     * <p>PDFBox stamps a creation date, a modification date and a random file identifier,
     * so converting the same TIFF twice produces two different digests — and in a
     * content-addressed store that means two copies of the same document at two addresses.
     * The conversion cache hides this in normal operation, because it is keyed on the
     * source; it surfaces the moment the cache is purged and every bundle is reconverted
     * to a new address, orphaning the old one.
     *
     * <p>A conversion is a pure function of its input and should address like one.
     */
    private void stripNondeterminism(PDDocument pdf) {
        var info = pdf.getDocumentInformation();
        info.setCreationDate(null);
        info.setModificationDate(null);
        info.setProducer("tb-helix-ai-svc");
        // A fixed ID pair. PDFBox derives a random one from the current time otherwise.
        var id = new org.apache.pdfbox.cos.COSArray();
        var fixed = new org.apache.pdfbox.cos.COSString(new byte[16]);
        id.add(fixed);
        id.add(fixed);
        pdf.getDocument().getTrailer().setItem(org.apache.pdfbox.cos.COSName.ID, id);
    }

    private int countPagesOf(byte[] pdf) {
        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdf)) {
            return doc.getNumberOfPages();
        } catch (IOException e) {
            return 0;
        }
    }

    private long sizeOf(String sha) {
        return blobs.get(sha).map(b -> (long) b.length).orElse(0L);
    }

    private BlobRef recomputeAfterMissingBytes(String sourceSha, DerivationKey key) {
        log.warn("Cached conversion for {} points at bytes that are gone; reconverting",
                sourceSha.substring(0, 12));
        byte[] tiff = blobs.get(sourceSha).orElseThrow(
                () -> new DocumentException("Source not in the blob store: " + sourceSha.substring(0, 12)));
        byte[] pdf = convert(tiff);
        BlobRef stored = blobs.put(pdf, "application/pdf", "converted.pdf");
        blobs.reference(stored.sha256(), BlobOwner.DERIVATION, key.hash(), "converted_pdf");
        cache.store(key, DerivationCache.Entry.of(
                new Converted(stored.sha256(), countPagesOf(pdf)), stored.sha256()));
        return stored;
    }
}
