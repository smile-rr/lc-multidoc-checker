package com.tb.helix.lccheck.stage.interpret;

import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.harness.llm.vision.VisionResult;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.infra.prompt.Prompts;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.service.ModelSpend;
import com.tb.helix.lccheck.service.ExtractionSpec;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.types.pipeline.StageId;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Reading the presentation.
 *
 * <p>Two passes, at deliberately different resolutions, because they are different
 * questions — plus a third, layout markdown dump per document that reuses the same
 * render and is cached separately:
 *
 * <ul>
 *   <li><b>Segment</b> — "what kind of document is each page?" Answered from layout and
 *       headings, so 800 px is plenty. One call for the whole bundle.
 *   <li><b>Extract</b> — "what does this document say?" Has to read a unit price, so
 *       1600 px. One call per document, over only that document's pages.
 *   <li><b>Layout markdown</b> — full-page reading as markdown, same pages and render
 *       spec (so PNG L1 hits). Cached as {@code extract.doc.md}; the officer fallback
 *       when structured fields are thin or wrong.
 * </ul>
 *
 * <p>Running the bulk pass at extraction resolution is the single largest avoidable cost in
 * the system — roughly ten times what the question needs on a long bundle.
 */
@Component
public class InterpretStage implements Stage {

    private static final Logger log = LoggerFactory.getLogger(InterpretStage.class);

    private final PageRenderer renderer;
    private final RenderProperties render;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final CaseStore cases;
    private final DocumentTypes docTypes;
    private final ExtractionSpec spec;
    private final Prompts prompts;
    private final ObjectMapper json;

    public InterpretStage(PageRenderer renderer, RenderProperties render, LlmGateway models,
                          DerivationCache cache, CaseStore cases, DocumentTypes docTypes,
                          ExtractionSpec spec, Prompts prompts, ObjectMapper json) {
        this.renderer = renderer;
        this.render = render;
        this.models = models;
        this.cache = cache;
        this.cases = cases;
        this.docTypes = docTypes;
        this.spec = spec;
        this.prompts = prompts;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.INTERPRET;
    }

    @Override
    public List<Step<StageContext>> steps() {
        return List.of(
                Step.<StageContext>of("segment", "Sorting the pages into documents", this::runSegment),
                Step.<StageContext>of("extract", "Reading each document", this::runExtract));
    }

    /**
     * Which page is which document.
     *
     * <p>Refuses an over-long bundle rather than truncating it: examining the first 300
     * pages of 400 looks exactly like examining all of them, and that is the worse failure.
     */
    private StepResult runSegment(StageContext ctx) {
        String pdfSha = cases.find(ctx.caseId()).orElseThrow().bundlePdfSha();
        if (pdfSha == null) return StepResult.failed("No presentation bundle on this case.");

        int pages = renderer.pageCount(pdfSha);
        if (pages > render.maxBundlePages()) {
            return StepResult.failed("This bundle has " + pages + " pages; the limit is "
                    + render.maxBundlePages() + ". Split it or raise helix.render.max-bundle-pages.");
        }

        // The engine already announced this step. A second announce here opened a second
        // "segment" row on the run log; do not re-announce.
        Map<Integer, String> byPage = segment(ctx, pdfSha, pages);
        writeDocuments(ctx, byPage, pages);
        // The document rail can be drawn now, before a single field has been read.
        return StepResult.done("Pages sorted",
                Map.of("pages", pages, "documents", byPage.values().stream().distinct().count()));
    }

    /**
     * The fields, one vision call per document — then a layout markdown dump of the
     * same pages, also cached, as the fallback reading when fields are thin or wrong.
     *
     * <p>One declared step for a fan-out whose width is not known until segmentation has
     * run — so the step is "extract" and its body re-announces with the document it is on.
     * Declaring a step per document would mean {@link #steps()} depending on the case, which
     * is the one thing a declaration must not do.
     */
    private StepResult runExtract(StageContext ctx) {
        String pdfSha = cases.find(ctx.caseId()).orElseThrow().bundlePdfSha();
        Map<Integer, String> byPage = new LinkedHashMap<>();
        for (var p : cases.bundlePages(ctx.caseId())) byPage.put(p.pageNo(), p.docCode());

        int read = extractAll(ctx, pdfSha, byPage);
        return StepResult.done(read + " documents read", Map.of("documents", read));
    }

    // --- Segmentation -------------------------------------------------------

    private Map<Integer, String> segment(StageContext ctx, String pdfSha, int pageCount) {
        List<Integer> all = new ArrayList<>();
        for (int i = 1; i <= pageCount; i++) all.add(i);

        var spec = render.specFor("segment");
        // Built per run, not once at class load: the vocabulary is authored, so it can
        // change between two cases. Hashing the assembled prompt into the key is what makes
        // that safe — add a document type in the console and the next bundle is re-read
        // rather than answered from a cache that never heard of it.
        String prompt = prompts.fill("segment-bundle", Map.of(
                "docTypes", docTypes.vocabulary(),
                "unknown", DocumentTypes.UNKNOWN,
                "pages", pageCount));

        var key = new DerivationKey(CacheOp.SEGMENT_BUNDLE, CacheOp.SEGMENT_BUNDLE_V, pdfSha,
                "1-" + pageCount, DerivationKey.sha256Hex(prompt), "role:segment", null,
                spec.asCacheParams());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            List<byte[]> images = renderer.render(pdfSha, all, spec);
            VisionResult result = models.read(VisionRequest.of(LlmRole.SEGMENT, images, prompt, all));
            return new DerivationCache.Entry<>(result.fields(), null, null, ModelSpend.of(result.usage(), result.model()));
        });

        Map<Integer, String> byPage = readPageMap(hit.value(), pageCount);
        // Progress while the step is still open, so the UI attaches these to "segment"
        // rather than dumping them under the stage after extract has already finished.
        for (int p = 1; p <= pageCount; p++) {
            ctx.emit(HelixEvent.SEGMENT, Map.of("done", p, "total", pageCount));
        }

        if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
            ctx.recordCachedStep("segment", Map.of("pages", pageCount), null);
        } else {
            ctx.recordStep("segment", Map.of("pages", pageCount));
        }

        return byPage;
    }

    @SuppressWarnings("unchecked")
    private Map<Integer, String> readPageMap(Object value, int pageCount) {
        Map<Integer, String> out = new LinkedHashMap<>();
        if (value instanceof Map<?, ?> map) {
            Object pagesNode = map.get("pages");
            if (pagesNode instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        Integer page = asInt(m.get("page"));
                        Object raw = m.get("docType");
                        String type = raw == null ? "UNKNOWN" : String.valueOf(raw);
                        if (page != null) out.put(page, docTypes.known(type) ? type : DocumentTypes.UNKNOWN);
                    }
                }
            }
        }
        // A page the model skipped is not dropped. Prefer the previous page's type —
        // the usual miss is a continuation sheet — over inventing UNKNOWN, which the
        // officer then has to reclassify by hand. Only the first page, or a gap after
        // an already-unknown page, stays UNKNOWN.
        for (int p = 1; p <= pageCount; p++) {
            if (out.containsKey(p)) continue;
            String prev = p > 1 ? out.get(p - 1) : null;
            out.put(p, prev != null && !DocumentTypes.UNKNOWN.equals(prev) ? prev : DocumentTypes.UNKNOWN);
        }
        return out;
    }

    private void writeDocuments(StageContext ctx, Map<Integer, String> byPage, int pageCount) {
        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        byPage.forEach((page, code) -> grouped.computeIfAbsent(code, k -> new ArrayList<>()).add(page));

        // Identified documents keep first-seen order; Unidentified always last so the
        // rail reads as the presentation, then the leftovers.
        List<Map.Entry<String, List<Integer>>> ordered = new ArrayList<>(grouped.entrySet());
        ordered.sort((a, b) -> {
            boolean ua = DocumentTypes.UNKNOWN.equals(a.getKey());
            boolean ub = DocumentTypes.UNKNOWN.equals(b.getKey());
            if (ua == ub) return 0;
            return ua ? 1 : -1;
        });

        int ordinal = 1;
        for (var entry : ordered) {
            String code = entry.getKey();
            List<Integer> pages = entry.getValue().stream().sorted().toList();
            cases.upsertDocument(ctx.caseId(), code, Rows.of(
                    "role", "presented", "docType", docTypes.label(code), "abbr", docTypes.abbr(code),
                    "icon", "file-text", "fileName", "bundle",
                    "pageFrom", pages.get(0), "pageTo", pages.get(pages.size() - 1),
                    "pages", pages, "extraction", "ocr", "ordinal", ordinal++));
        }
        byPage.forEach((page, code) ->
                cases.setBundlePage(ctx.caseId(), page, code, docTypes.label(code)));
    }

    // --- Extraction ---------------------------------------------------------

    private int extractAll(StageContext ctx, String pdfSha, Map<Integer, String> byPage) {
        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        byPage.forEach((page, code) -> {
            if (!DocumentTypes.UNKNOWN.equals(code)) grouped.computeIfAbsent(code, k -> new ArrayList<>()).add(page);
        });

        var spec = render.specFor("extract");
        int read = 0;
        for (var entry : grouped.entrySet()) {
            if (ctx.cancelled()) return read;
            String code = entry.getKey();
            List<Integer> pages = entry.getValue().stream().sorted().toList();
            String scope = code + "|" + pages.get(0) + "-" + pages.get(pages.size() - 1);
            String prompt = extractPrompt(code);
            // The slowest thing in the stage — one vision call per document — and until
            // now the only thing the officer saw of it was a progress bar that had
            // already reached the end of segmentation.
            ctx.announce("extract:" + code, "Reading the " + docTypes.label(code).toLowerCase());

            var key = new DerivationKey(CacheOp.EXTRACT_DOC, CacheOp.EXTRACT_DOC_V, pdfSha, scope,
                    DerivationKey.sha256Hex(prompt), "role:extract", null, spec.asCacheParams());

            try {
                var hit = cache.computeIfAbsent(key, Map.class, () -> {
                    List<byte[]> images = renderer.render(pdfSha, pages, spec);
                    VisionResult result = models.read(
                            VisionRequest.of(LlmRole.EXTRACT, images, prompt, pages));
                    return new DerivationCache.Entry<>(result.fields(), null, null, ModelSpend.of(result.usage(), result.model()));
                });

                int offSchema = writeFacts(ctx, code, pages.get(0), hit.value());
                read++;
                // Per document rather than per stage, because a cache hit here is the
                // difference between four seconds and four minutes and the officer should
                // see which they got.
                Map<String, Object> what = new LinkedHashMap<>(Map.of("pages", pages));
                if (offSchema > 0) what.put("offSchema", offSchema);
                if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
                    ctx.recordCachedStep("extract:" + code, what, null);
                } else {
                    ctx.recordStep("extract:" + code, what);
                }
            } catch (RuntimeException e) {
                // One document that could not be read must not lose the other five.
                log.warn("Extraction failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
                ctx.recordFailedStep("extract:" + code, e.getMessage());
            }

            // Layout markdown — same pages and render spec (so PNG L1 hits), separate
            // cache op/prompt so a field hit is never mistaken for a layout hit.
            extractLayoutMd(ctx, pdfSha, code, pages, scope, spec);
        }
        return read;
    }

    /**
     * Full-page markdown of one document, for officer fallback and later tools.
     *
     * <p>Cached under {@link CacheOp#EXTRACT_DOC_MD}. Keyed on the same PDF + page span +
     * render params as field extract, with its own prompt SHA — identical input and
     * parameters reuse the entry across cases.
     */
    @SuppressWarnings("unchecked")
    private void extractLayoutMd(StageContext ctx, String pdfSha, String code,
                                 List<Integer> pages, String scope,
                                 com.tb.helix.harness.doc.RenderSpec spec) {
        if (ctx.cancelled()) return;
        String prompt = prompts.get("extract-doc-md");
        ctx.announce("extract-md:" + code, "Layout text · " + docTypes.label(code).toLowerCase());

        var key = new DerivationKey(CacheOp.EXTRACT_DOC_MD, CacheOp.EXTRACT_DOC_MD_V, pdfSha, scope,
                DerivationKey.sha256Hex(prompt), "role:extract.md", null, spec.asCacheParams());

        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                List<byte[]> images = renderer.render(pdfSha, pages, spec);
                VisionResult result = models.read(
                        VisionRequest.of(LlmRole.EXTRACT, images, prompt, pages));
                String md = markdownOf(result.fields());
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("markdown", md);
                // rawResponse = prose markdown so L3 can write a .md sidecar, not JSON.
                return new DerivationCache.Entry<>(value, null, md, ModelSpend.of(result.usage(), result.model()));
            });

            String md = markdownOf(hit.value());
            if (md != null && !md.isBlank()) {
                cases.setDocumentLayoutMd(ctx.caseId(), code, md);
            }
            Map<String, Object> what = Map.of(
                    "pages", pages,
                    "chars", md == null ? 0 : md.length());
            if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
                ctx.recordCachedStep("extract-md:" + code, what, null);
            } else {
                ctx.recordStep("extract-md:" + code, what);
            }
        } catch (RuntimeException e) {
            log.warn("Layout markdown failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
            ctx.recordFailedStep("extract-md:" + code, e.getMessage());
        }
    }

    /** Pulls the markdown string out of the VLM JSON envelope {@code {markdown:…}}. */
    private static String markdownOf(Object value) {
        if (value == null) return null;
        if (value instanceof String s) return s;
        if (value instanceof Map<?, ?> map) {
            Object m = map.get("markdown");
            return m == null ? null : String.valueOf(m);
        }
        return null;
    }

    /**
     * What the document said, keyed the dictionary's way.
     *
     * <p>Every reading is folded onto a dictionary key where one exists, so a fact can be
     * joined to the rule that cites it. What will not fold is kept and marked rather than
     * dropped: an unauthored field is still evidence, and the mark is how anyone learns the
     * dictionary is missing something. Before this, the key stored was whatever the model
     * invented — 105 of them across a handful of cases, against 22 dictionary fields, and
     * the seven that matched did so by coincidence of capitalisation.
     */
    @SuppressWarnings("unchecked")
    private int writeFacts(StageContext ctx, String docCode, int firstPage, Object value) {
        if (!(value instanceof Map<?, ?> map)) return 0;

        Map<String, Object> returned = new LinkedHashMap<>();
        map.forEach((k, v) -> returned.put(String.valueOf(k), v));

        int offSchema = 0;
        for (var reading : spec.read(docCode, returned).values()) {
            Object v = reading.value();
            // A nested object is the model elaborating where a flat value was asked for.
            // Kept as JSON rather than dropped: an officer can still read it.
            String text = v instanceof Map || v instanceof List ? toJson(v) : String.valueOf(v);
            if (text.isBlank()) continue;
            if (!reading.known()) offSchema++;

            cases.upsertFact(ctx.caseId(), Rows.of(
                    "docId", docCode,
                    "label", reading.label(),
                    "fieldKey", reading.key(),
                    "value", text,
                    "valueNorm", text.strip().toUpperCase(),
                    "page", firstPage,
                    "source", "p." + firstPage,
                    // Said plainly on the fact itself. An officer sorting by it sees what the
                    // dictionary does not yet cover, which is the only way that list is ever
                    // going to get shorter.
                    "flag", reading.known() ? null : "Not in the dictionary",
                    "confidence", "MED"));
        }
        return offSchema;
    }

    private String toJson(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }

    private static String humanise(String key) {
        String s = key.replace('_', ' ').strip();
        return s.isEmpty() ? key : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static Integer asInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o).strip());
        } catch (Exception e) {
            return null;
        }
    }


    /**
     * Built from the dictionary, never written by hand.
     *
     * <p>The fields asked for are this document's bindings — key, label and the author's own
     * note on how to read it here — so adding one in the console changes the next
     * extraction and there is no template to remember to update. The predecessor kept both
     * and they drifted within a release.
     *
     * <p>The reading stays open past that list. A document carries more than the dictionary
     * has been taught, and an examiner may want it; what the list buys is that everything
     * the dictionary <em>does</em> know comes back under the key a rule can cite.
     */
    private String extractPrompt(String code) {
        String known = spec.fieldLines(code);
        String asked = known.isBlank()
                ? """
                  The dictionary has no fields bound to this document type yet, so there is
                  nothing specific to ask for. Report what the document carries, naming each
                  field the way the document itself names it.
                  """
                : "Report these first, under exactly these names:\n\n" + known;

        return """
                Read this %s and report the fields written on it.

                %s
                Then report anything else the document carries that is not in that list,
                naming each one the way the document itself names it, in snake_case. A field
                nobody has asked for is still evidence.

                Rules:
                - Copy values exactly as printed. Do not normalise, reformat or convert.
                - Dates in ISO form (YYYY-MM-DD) only when the printed form is unambiguous;
                  otherwise copy what is printed.
                - Amounts with their currency, as shown.
                - Omit a field entirely rather than guessing. A missing value is a fact an
                  examiner can act on; an invented one is not.

                Return only JSON: a flat object of field name to value.
                """.formatted(docTypes.label(code).toLowerCase(), asked);
    }
}
