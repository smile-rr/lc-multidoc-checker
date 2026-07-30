package com.tb.helix.harness.doc;

import com.tb.helix.infra.blob.BlobStore;
import com.tb.helix.infra.cache.CacheTier;
import com.tb.helix.infra.error.DocumentException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * PDF pages to PNG, for a vision model to read.
 *
 * <p>Renders are model input; the browser is served the PDF and rasterises it itself. So
 * nothing is persisted here by default — a page at 200 dpi is about 1.5 MB, a render is a
 * second or two, and the cache above this decides whether a render is needed at all. What
 * <em>is</em> cached is the render itself in L1, because several vision slots examining
 * the same pages in one run would otherwise each rasterise them. That repetition was the
 * waste worth removing, not the rasterising.
 *
 * <p><b>The long-edge cap is applied.</b> Its predecessor hashed a cap into the cache key
 * and never enforced it, so the key described a request that was never made — and two
 * slots configured at different resolutions quietly shared one render at a third. Every
 * field of {@link RenderSpec} is in the key here, and every field changes the output.
 */
@Component
public class PdfBoxPageRenderer implements PageRenderer {

    private static final Logger log = LoggerFactory.getLogger(PdfBoxPageRenderer.class);

    private final BlobStore blobs;
    private final CacheTier l1;

    public PdfBoxPageRenderer(BlobStore blobs, List<CacheTier> tiers) {
        this.blobs = blobs;
        // L1 only. A rendered page is derived, cheap to redo, and large — putting it in a
        // shared or durable tier would spend storage to avoid a second of CPU.
        this.l1 = tiers.stream()
                .filter(t -> t.level() == CacheTier.Level.L1 && t.enabled())
                .findFirst().orElse(null);
    }

    @Override
    public List<byte[]> render(String pdfSha, List<Integer> pageNumbers, RenderSpec spec) {
        List<Integer> pages = pageNumbers.stream().distinct().sorted(Comparator.naturalOrder())
                .limit(spec.maxPages()).toList();
        if (pages.isEmpty()) return List.of();

        List<byte[]> out = new ArrayList<>(pages.size());
        List<Integer> toRender = new ArrayList<>();

        // Per page rather than per request, so overlapping page sets share their overlap
        // instead of each rendering the whole span.
        for (Integer page : pages) {
            Optional<byte[]> cached = fromL1(pdfSha, page, spec);
            if (cached.isPresent()) out.add(cached.get());
            else { out.add(null); toRender.add(page); }
        }

        if (!toRender.isEmpty()) {
            long started = System.currentTimeMillis();
            byte[] pdf = blobs.get(pdfSha).orElseThrow(
                    () -> new DocumentException("PDF not in the blob store: " + pdfSha.substring(0, 12)));

            try (PDDocument doc = Loader.loadPDF(pdf)) {
                PDFRenderer renderer = new PDFRenderer(doc);
                int total = doc.getNumberOfPages();
                for (Integer page : toRender) {
                    if (page < 1 || page > total) {
                        throw new DocumentException(
                                "Page " + page + " was asked for, but the document has " + total + ".",
                                "page_out_of_range", null);
                    }
                    BufferedImage image = renderer.renderImageWithDPI(page - 1, spec.dpi());
                    byte[] png = toPng(downscale(image, spec.maxLongEdgePx()));
                    toL1(pdfSha, page, spec, png);
                    out.set(pages.indexOf(page), png);
                }
            } catch (IOException e) {
                throw new DocumentException("Could not render the document: " + e.getMessage(),
                        "render_failed", e);
            }
            log.debug("Rendered {} of {} page(s) of {} at {} dpi in {} ms",
                    toRender.size(), pages.size(), pdfSha.substring(0, 12), spec.dpi(),
                    System.currentTimeMillis() - started);
        }
        return out;
    }

    @Override
    public int pageCount(String pdfSha) {
        byte[] pdf = blobs.get(pdfSha).orElseThrow(
                () -> new DocumentException("PDF not in the blob store: " + pdfSha.substring(0, 12)));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            int pages = doc.getNumberOfPages();
            // Tell the catalogue, so the next caller reads a column instead of a document.
            blobs.recordPageCount(pdfSha, pages);
            return pages;
        } catch (IOException e) {
            throw new DocumentException("Could not read the document: " + e.getMessage(), "pdf_unreadable", e);
        }
    }

    @Override
    public byte[] extractPages(String pdfSha, List<Integer> pageNumbers) {
        byte[] pdf = blobs.get(pdfSha).orElseThrow(
                () -> new DocumentException("PDF not in the blob store: " + pdfSha.substring(0, 12)));
        try (PDDocument src = Loader.loadPDF(pdf); PDDocument out = new PDDocument()) {
            int total = src.getNumberOfPages();
            for (Integer page : pageNumbers) {
                if (page < 1 || page > total) {
                    throw new DocumentException(
                            "Page " + page + " was asked for, but the document has " + total + ".",
                            "page_out_of_range", null);
                }
                out.addPage(src.getPage(page - 1));
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            out.save(bos);
            return bos.toByteArray();
        } catch (IOException e) {
            throw new DocumentException("Could not split the document: " + e.getMessage(), "split_failed", e);
        }
    }

    // --- Helpers -------------------------------------------------------------

    /**
     * Downscales so the longer edge fits the cap.
     *
     * <p>Providers resize server-side regardless; doing it here means the bytes on the
     * wire are the bytes the model sees, so payload size and cost are predictable rather
     * than a function of someone else's resizing policy.
     */
    private BufferedImage downscale(BufferedImage image, Integer maxLongEdge) {
        if (maxLongEdge == null || maxLongEdge <= 0) return image;
        int longEdge = Math.max(image.getWidth(), image.getHeight());
        if (longEdge <= maxLongEdge) return image;

        double ratio = (double) maxLongEdge / longEdge;
        int w = Math.max(1, (int) Math.round(image.getWidth() * ratio));
        int h = Math.max(1, (int) Math.round(image.getHeight() * ratio));

        BufferedImage scaled = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        var g = scaled.createGraphics();
        g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(image.getScaledInstance(w, h, Image.SCALE_SMOOTH), 0, 0, null);
        g.dispose();
        return scaled;
    }

    private byte[] toPng(BufferedImage image) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(image, "PNG", bos);
        return bos.toByteArray();
    }

    // Every field of the spec is in the key, because every field changes the pixels.
    private String l1Key(String pdfSha, int page, RenderSpec spec) {
        return "render:" + pdfSha + ":p" + page + ":" + spec.dpi() + ":"
                + (spec.maxLongEdgePx() == null ? "" : spec.maxLongEdgePx());
    }

    private Optional<byte[]> fromL1(String pdfSha, int page, RenderSpec spec) {
        return l1 == null ? Optional.empty() : l1.get(l1Key(pdfSha, page, spec));
    }

    private void toL1(String pdfSha, int page, RenderSpec spec, byte[] png) {
        if (l1 != null) l1.put(l1Key(pdfSha, page, spec), png, Duration.ZERO);
    }
}
