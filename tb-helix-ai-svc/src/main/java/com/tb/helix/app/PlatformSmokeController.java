package com.tb.helix.app;

import com.tb.helix.harness.doc.DocumentConverter;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderSpec;
import com.tb.helix.infra.blob.BlobOwner;
import com.tb.helix.infra.blob.BlobRef;
import com.tb.helix.infra.blob.BlobStore;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Proves the platform works, before there is any business logic to prove it with.
 *
 * <p>M1 delivers a foundation — blob store, cache tiers, converter, renderer — and a
 * foundation nobody has exercised is a foundation nobody should trust. These three
 * endpoints walk the whole of it: store bytes, convert them, cache the conversion, render
 * pages, serve the result.
 *
 * <p>Lives in {@code app} because it belongs to neither business module and reaches
 * straight for platform ports. It comes out at cutover, when the real intake stage does
 * the same walk for real.
 */
@RestController
@RequestMapping("/api/v1/platform")
public class PlatformSmokeController {

    private final BlobStore blobs;
    private final DocumentConverter converter;
    private final PageRenderer renderer;

    public PlatformSmokeController(BlobStore blobs, DocumentConverter converter, PageRenderer renderer) {
        this.blobs = blobs;
        this.converter = converter;
        this.renderer = renderer;
    }

    /**
     * Stores an upload, converting TIFF to PDF on the way in.
     *
     * <p>The response reports both digests and whether a conversion happened, so the same
     * file uploaded twice visibly produces the same addresses — which is the dedup and the
     * cache demonstrating themselves rather than being asserted.
     */
    @PostMapping(value = "/ingest", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> ingest(@RequestPart("file") MultipartFile file) throws IOException {
        String mediaType = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        String name = file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename();

        // The original is stored first, always, and never replaced by its conversion.
        BlobRef source = blobs.put(file.getBytes(), mediaType, name);
        blobs.reference(source.sha256(), BlobOwner.CASE, "smoke", "source");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sourceSha", source.sha256());
        out.put("sourceBytes", source.byteSize());
        out.put("mediaType", mediaType);

        boolean needed = converter.needsConversion(mediaType) || name.toLowerCase().matches(".*\\.tiff?$");
        out.put("converted", needed);

        String pdfSha = source.sha256();
        if (needed) {
            long started = System.currentTimeMillis();
            BlobRef pdf = converter.toPdf(source.sha256());
            pdfSha = pdf.sha256();
            out.put("convertMs", System.currentTimeMillis() - started);
        }
        out.put("pdfSha", pdfSha);
        out.put("pageCount", renderer.pageCount(pdfSha));
        return out;
    }

    /** Serves a stored PDF — what the viewer will fetch once cases exist. */
    @GetMapping("/blobs/{sha}.pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String sha) {
        return blobs.get(sha)
                .map(bytes -> ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_PDF)
                        .body(bytes))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Renders pages, reporting timings.
     *
     * <p>Call it twice: the second call should be markedly faster and produce identical
     * sizes, which is the L1 render cache doing the thing it exists for.
     */
    @GetMapping("/blobs/{sha}/render")
    public Map<String, Object> render(@PathVariable String sha,
                                      @RequestParam(defaultValue = "1") int from,
                                      @RequestParam(defaultValue = "3") int to,
                                      @RequestParam(defaultValue = "200") int dpi,
                                      @RequestParam(defaultValue = "2048") int maxLongEdge) {
        List<Integer> pages = java.util.stream.IntStream.rangeClosed(from, to).boxed().toList();
        long started = System.currentTimeMillis();
        List<byte[]> rendered = renderer.render(sha, pages, new RenderSpec(dpi, 20, maxLongEdge));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pages", pages);
        out.put("renderMs", System.currentTimeMillis() - started);
        out.put("pngBytes", rendered.stream().map(b -> b == null ? 0 : b.length).toList());
        return out;
    }
}
