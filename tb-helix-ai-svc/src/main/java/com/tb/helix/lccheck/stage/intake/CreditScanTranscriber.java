package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.doc.RenderSpec;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.error.DocumentException;
import com.tb.helix.harness.prompt.Prompts;
import com.tb.helix.lccheck.service.ModelSpend;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * A scanned credit PDF to plain SWIFT text, by vision.
 *
 * <p>One call over every page the profile allows. The result is ordinary UTF-8 text — the
 * same shape a {@code .txt} upload would have produced — so {@link SwiftReader} and
 * {@link CreditReader} do not know the pages were ever pictures.
 *
 * <p>Cached on the PDF digest and the prompt: the same scan transcribes once.
 */
@Component
public class CreditScanTranscriber {

    private static final Logger log = LoggerFactory.getLogger(CreditScanTranscriber.class);

    private final LlmGateway models;
    private final PageRenderer renderer;
    private final RenderProperties render;
    private final DerivationCache cache;
    private final Prompts prompts;

    public CreditScanTranscriber(LlmGateway models, PageRenderer renderer, RenderProperties render,
                                 DerivationCache cache, Prompts prompts) {
        this.models = models;
        this.renderer = renderer;
        this.render = render;
        this.cache = cache;
        this.prompts = prompts;
    }

    /**
     * Transcribes the stored credit PDF into SWIFT plain text.
     *
     * @param pdfSha blob address of the scanned PDF (already in the store)
     */
    public String transcribe(String pdfSha) {
        RenderSpec spec = render.specFor("transcribe");
        int pages = renderer.pageCount(pdfSha);
        if (pages <= 0) {
            throw new DocumentException("The credit PDF has no pages to read.");
        }
        int take = Math.min(pages, spec.maxPages());
        if (take < pages) {
            log.warn("Credit scan {} has {} pages; transcribing the first {} only",
                    pdfSha.substring(0, 8), pages, take);
        }

        List<Integer> pageNums = new ArrayList<>(take);
        for (int p = 1; p <= take; p++) pageNums.add(p);

        String prompt = prompts.get("credit-transcribe");
        var key = new DerivationKey(CacheOp.TRANSCRIBE_CREDIT, CacheOp.TRANSCRIBE_CREDIT_V,
                pdfSha, "pages:1-" + take,
                DerivationKey.sha256Hex(prompt), models.identity(LlmRole.TRANSCRIBE), null,
                spec.asCacheParams());

        var hit = cache.computeIfAbsent(key, String.class, () -> {
            List<byte[]> images = renderer.render(pdfSha, pageNums, spec);
            var result = models.read(VisionRequest.of(LlmRole.TRANSCRIBE, images, prompt, pageNums));
            String text = textOf(result.fields());
            if (text == null || text.isBlank()) {
                throw new DocumentException(
                        "Vision returned no credit text from the scan. Try a clearer PDF or a .txt dump.");
            }
            return new DerivationCache.Entry<>(text, null, result.slotResults().isEmpty()
                    ? null
                    : result.slotResults().getFirst().rawResponse(),
                    ModelSpend.of(result.usage(), result.model()));
        });

        return hit.value();
    }

    private static String textOf(Map<String, Object> fields) {
        if (fields == null || fields.isEmpty()) return null;
        Object text = fields.get("text");
        if (text == null) text = fields.get("swift");
        if (text == null) text = fields.get("transcription");
        return text == null ? null : String.valueOf(text).strip();
    }
}
