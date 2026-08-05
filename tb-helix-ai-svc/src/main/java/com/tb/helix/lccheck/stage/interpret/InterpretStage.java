package com.tb.helix.lccheck.stage.interpret;

import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.doc.RenderSpec;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.harness.llm.vision.VisionResult;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.cost.CallScope;
import com.tb.helix.infra.pipeline.FanOut;
import com.tb.helix.infra.pipeline.Step;
import com.tb.helix.harness.prompt.Prompts;
import com.tb.helix.infra.pipeline.StepResult;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.Rows;
import com.tb.helix.lccheck.service.DocumentAttestor;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.service.FactWriter;
import com.tb.helix.lccheck.service.ModelSpend;
import com.tb.helix.lccheck.service.ExtractionSpec;
import com.tb.helix.lccheck.pipeline.*;
import com.tb.helix.lccheck.pipeline.StageContext;
import com.tb.helix.lccheck.types.pipeline.StageId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Reading the presentation.
 *
 * <p>Two passes, at deliberately different resolutions, because they are different
 * questions — plus two more per document that reuse the same render and are cached
 * separately:
 *
 * <ul>
 *   <li><b>Segment</b> — "what kind of document is each page?" Answered from layout and
 *       headings, so 800 px is plenty. One call for the whole bundle.
 *   <li><b>Extract</b> — "what does this document say?" Has to read a unit price, so
 *       1600 px. One call per document, over only that document's pages.
 *   <li><b>Layout markdown</b> — full-page reading as markdown, same pages and render
 *       spec (so PNG L1 hits). Cached as {@code extract.doc.md}; the officer fallback
 *       when structured fields are thin or wrong.
 *   <li><b>Attest</b> — "what is on the page that is not text?" Signatures, seals,
 *       initialled corrections, added clausing. Same pages and spec again, cached as
 *       {@code attest.doc}. Runs only where the dictionary has bound an attestation,
 *       which is the document types UCP names — so most documents skip it entirely.
 * </ul>
 *
 * <p>The three per-document passes send byte-identical images and differ only in the
 * trailing instruction, which is why the gateway puts images first: the second and third
 * ride the prefix the first paid for.
 *
 * <p>Running the bulk pass at extraction resolution is the single largest avoidable cost in
 * the system — roughly ten times what the question needs on a long bundle.
 *
 * <h2>Documents are read in parallel; a document's own passes are not</h2>
 *
 * <p>A twenty-document presentation read one document at a time is twenty model calls end to
 * end, and an officer waiting through all of them. Documents are independent — separate pages,
 * separate cache keys, separate facts — so they fan out, {@code helix.check.interpret.concurrency}
 * at a time.
 *
 * <p><b>The three passes within one document stay sequential, and that is not an oversight.</b>
 * They ride each other's prefix cache, which only works if the first has returned before the
 * second is sent. Firing them together would pay full image tokens three times over for the
 * same pages — the fan-out would be measurably faster and cost roughly triple.
 *
 * <p>Segmentation does not fan out either, for a different reason: each batch is handed the
 * previous batch's last document type as continuation context, and that text is part of its
 * cache key. The batches are a chain, not a set.
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
    private final FactWriter facts;
    private final DocumentAttestor attestor;
    private final Prompts prompts;
    private final int concurrency;

    /**
     * @param concurrency how many documents may be read at once. Four is chosen for what
     *                    breaks first, and that is not the model: a render loads the whole
     *                    bundle into heap, and the connection pool is ten. Raising it past
     *                    what one provider key will take turns saved minutes into throttled
     *                    calls.
     */
    public InterpretStage(PageRenderer renderer, RenderProperties render, LlmGateway models,
                          DerivationCache cache, CaseStore cases, DocumentTypes docTypes,
                          ExtractionSpec spec, FactWriter facts, DocumentAttestor attestor,
                          Prompts prompts,
                          @Value("${helix.check.interpret.concurrency:4}") int concurrency) {
        this.concurrency = Math.max(1, concurrency);
        this.renderer = renderer;
        this.render = render;
        this.models = models;
        this.cache = cache;
        this.cases = cases;
        this.docTypes = docTypes;
        this.spec = spec;
        this.facts = facts;
        this.attestor = attestor;
        this.prompts = prompts;
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
     * <p>Refuses an over-long bundle rather than truncating it: examining the first 150
     * pages of 200 looks exactly like examining all of them, and that is the worse failure.
     * Within the ceiling, pages are classified in batches of {@code segment.max-pages}.
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

    /**
     * Classifies every page, in batches of {@code segment.max-pages}.
     *
     * <p>One vision call cannot hold a 100-page bundle. Truncating silently would look
     * like a full read; so we walk the pages in windows, each keyed and cached on its
     * own span. The type of the last page of batch <em>n</em> is handed to batch
     * <em>n+1</em> as continuation context: a bill of lading that starts on page 38
     * and continues on 41 must stay one BOL, not split into BOL + UNKNOWN at the
     * batch boundary. After merge, adjacent pages with the same code still collapse
     * to one document in {@link #writeDocuments}.
     */
    private Map<Integer, String> segment(StageContext ctx, String pdfSha, int pageCount) {
        var spec = render.specFor("segment");
        int batchSize = Math.max(1, spec.maxPages());
        Map<Integer, String> byPage = new LinkedHashMap<>();
        boolean anyMiss = false;
        String vocabulary = docTypes.vocabulary();

        for (int from = 1; from <= pageCount; from += batchSize) {
            if (ctx.cancelled()) break;
            int to = Math.min(from + batchSize - 1, pageCount);
            List<Integer> batch = new ArrayList<>(to - from + 1);
            for (int p = from; p <= to; p++) batch.add(p);

            String prevType = from > 1 ? byPage.get(from - 1) : null;
            String continuation = continuationNote(from - 1, prevType);

            // Built per batch: vocabulary can change between cases, and the continuation
            // clause changes with the previous batch's ending — both belong in the key.
            String prompt = prompts.fill("segment-bundle", Map.of(
                    "docTypes", vocabulary,
                    "unknown", DocumentTypes.UNKNOWN,
                    "pages", batch.size(),
                    "pageFrom", from,
                    "pageTo", to,
                    "continuation", continuation));

            var key = new DerivationKey(CacheOp.SEGMENT_BUNDLE, CacheOp.SEGMENT_BUNDLE_V, pdfSha,
                    from + "-" + to, DerivationKey.sha256Hex(prompt), models.identity(LlmRole.SEGMENT), null,
                    spec.asCacheParams());

            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                List<byte[]> images = renderer.render(pdfSha, batch, spec);
                VisionResult result = models.read(
                        VisionRequest.of(LlmRole.SEGMENT, images, prompt, batch));
                return new DerivationCache.Entry<>(result.fields(), null, null,
                        ModelSpend.of(result.usage(), result.model()));
            });
            if (hit.tier() == com.tb.helix.infra.cache.CacheTier.Level.NONE) anyMiss = true;

            byPage.putAll(readPageMap(hit.value(), from, to, prevType));

            // Real progress as each batch lands — not a fake sweep after the fact.
            for (int p = from; p <= to; p++) {
                ctx.emit(HelixEvent.SEGMENT, Map.of("done", p, "total", pageCount));
            }
        }

        // Fill any hole the model skipped across the whole bundle.
        fillGaps(byPage, pageCount, null);

        if (anyMiss) {
            ctx.recordStep("segment", Map.of("pages", pageCount, "batches",
                    (pageCount + batchSize - 1) / batchSize));
        } else {
            ctx.recordCachedStep("segment", Map.of("pages", pageCount, "batches",
                    (pageCount + batchSize - 1) / batchSize), null);
        }
        return byPage;
    }

    /**
     * Tells the next batch what the previous one ended on.
     *
     * <p>Empty for the first batch. Without this, a multi-page instrument that straddles
     * the window (pages 38–42 of a BOL, batch split at 40) is often re-opened as a new
     * document or dropped to UNKNOWN on page 41.
     */
    private static String continuationNote(int prevPage, String prevType) {
        if (prevPage < 1 || prevType == null || prevType.isBlank()
                || DocumentTypes.UNKNOWN.equals(prevType)) {
            return "";
        }
        return """

                ## Continuation from the previous batch

                Bundle page %d (the page immediately before this batch) was classified as **%s**.
                If the first page(s) of this batch continue that same instrument — blank back,
                endorsement, terms, packing detail that belongs with it — keep **%s**.
                Only change type when this batch clearly starts a different instrument.
                """.formatted(prevPage, prevType, prevType);
    }

    /**
     * Reads one batch's model answer into absolute bundle page numbers.
     *
     * @param seedPrev type of the page before {@code from}, used when the first page of
     *                 the batch is missing or UNKNOWN so a straddling document stays joined
     */
    @SuppressWarnings("unchecked")
    private Map<Integer, String> readPageMap(Object value, int from, int to, String seedPrev) {
        Map<Integer, String> raw = new LinkedHashMap<>();
        if (value instanceof Map<?, ?> map) {
            Object pagesNode = map.get("pages");
            if (pagesNode instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        Integer page = asInt(m.get("page"));
                        Object typeRaw = m.get("docType");
                        String type = typeRaw == null ? DocumentTypes.UNKNOWN : String.valueOf(typeRaw);
                        if (page != null) {
                            raw.put(page, docTypes.known(type) ? type : DocumentTypes.UNKNOWN);
                        }
                    }
                }
            }
        }

        // Some models renumber 1..batchSize even when asked for bundle pages. Detect and
        // shift rather than writing types onto the wrong half of the presentation.
        boolean anyAbsolute = raw.keySet().stream().anyMatch(p -> p >= from && p <= to);
        Map<Integer, String> inRange = new LinkedHashMap<>();
        if (anyAbsolute) {
            raw.forEach((p, t) -> {
                if (p >= from && p <= to) inRange.put(p, t);
            });
        } else if (!raw.isEmpty()) {
            raw.forEach((p, t) -> {
                int abs = p + from - 1;
                if (abs >= from && abs <= to) inRange.put(abs, t);
            });
        }

        // Boundary stitch: first page of the batch inherits the previous batch's ending
        // type when the model left it UNKNOWN — the usual miss on a continuation sheet.
        if (from > 1 && seedPrev != null && !DocumentTypes.UNKNOWN.equals(seedPrev)) {
            String atStart = inRange.get(from);
            if (atStart == null || DocumentTypes.UNKNOWN.equals(atStart)) {
                inRange.put(from, seedPrev);
            }
        }

        fillGaps(inRange, to, seedPrev);
        // Drop anything outside this batch that fillGaps cannot have introduced.
        Map<Integer, String> out = new LinkedHashMap<>();
        for (int p = from; p <= to; p++) {
            String t = inRange.get(p);
            out.put(p, t != null ? t : DocumentTypes.UNKNOWN);
        }
        return out;
    }

    /**
     * Pages the model skipped inherit the previous page's type — continuation is the
     * usual miss — unless there is no previous (or it was UNKNOWN).
     */
    private static void fillGaps(Map<Integer, String> byPage, int lastPage, String seedPrev) {
        String prev = seedPrev;
        int first = byPage.isEmpty() ? 1 : byPage.keySet().stream().mapToInt(Integer::intValue).min().orElse(1);
        for (int p = Math.min(first, 1); p <= lastPage; p++) {
            if (byPage.containsKey(p)) {
                prev = byPage.get(p);
                continue;
            }
            if (p < first) continue;
            String fill = prev != null && !DocumentTypes.UNKNOWN.equals(prev) ? prev : DocumentTypes.UNKNOWN;
            byPage.put(p, fill);
            prev = fill;
        }
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

    /**
     * Every identified document, up to {@link #concurrency} of them at a time.
     *
     * <p>The units are independent in the only ways that matter: distinct page ranges,
     * distinct cache keys, distinct step keys, distinct fact rows. Nothing here is ordered
     * against anything else here — which is why this is a fan-out and the rest of the stage
     * is not.
     */
    private int extractAll(StageContext ctx, String pdfSha, Map<Integer, String> byPage) {
        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        byPage.forEach((page, code) -> {
            if (!DocumentTypes.UNKNOWN.equals(code)) grouped.computeIfAbsent(code, k -> new ArrayList<>()).add(page);
        });

        var spec = render.specFor("extract");
        List<Map.Entry<String, List<Integer>>> documents = List.copyOf(grouped.entrySet());
        AtomicInteger done = new AtomicInteger();

        List<Boolean> results = FanOut.over(documents, concurrency, entry -> {
            // Checked here rather than before the fan-out: every unit is submitted at once
            // and waits for a permit, so this is the point at which one has actually begun.
            // A cancel therefore costs at most `concurrency` more documents, not all of them.
            if (ctx.cancelled()) return Boolean.FALSE;

            String code = entry.getKey();
            List<Integer> pages = entry.getValue().stream().sorted().toList();
            boolean fieldsRead = extractOne(ctx, pdfSha, code, pages, spec);

            // One counted line rather than a dozen concurrent spinners. Emitted as each
            // document lands, so it is real progress and not a sweep after the fact.
            ctx.emit(HelixEvent.EXTRACT, Map.of(
                    "done", done.incrementAndGet(), "total", documents.size()));
            return fieldsRead;
        });

        return (int) results.stream().filter(Boolean.TRUE::equals).count();
    }

    /**
     * One document, read three ways, in this order and on one thread.
     *
     * <p>See the class note: the passes share byte-identical images, and the second and third
     * are cheap only because the first has already put that prefix in the provider's cache.
     *
     * @return whether the field pass produced facts. The other two passes can fail without
     *         making the document unread — a missing layout dump costs the officer a fallback
     *         view, a missing field pass costs them the document.
     */
    private boolean extractOne(StageContext ctx, String pdfSha, String code,
                               List<Integer> pages, RenderSpec spec) {
        String scope = code + "|" + pages.get(0) + "-" + pages.get(pages.size() - 1);

        boolean fieldsRead = extractFields(ctx, pdfSha, code, pages, scope, spec);

        // Layout markdown — same pages and render spec (so PNG L1 hits), separate
        // cache op/prompt so a field hit is never mistaken for a layout hit.
        extractLayoutMd(ctx, pdfSha, code, pages, scope, spec);

        // And what is on the pages that is not text, where the dictionary asks for it.
        attest(ctx, pdfSha, code, pages);

        return fieldsRead;
    }

    /** The field pass: what the document says, under the keys a rule can cite. */
    private boolean extractFields(StageContext ctx, String pdfSha, String code,
                                  List<Integer> pages, String scope, RenderSpec spec) {
        String stepKey = "extract:" + code;
        String prompt = extractPrompt(code);
        // The slowest thing in the stage — one vision call per document — and until
        // now the only thing the officer saw of it was a progress bar that had
        // already reached the end of segmentation.
        ctx.announce(stepKey, "Reading the " + docTypes.label(code).toLowerCase());

        var key = new DerivationKey(CacheOp.EXTRACT_DOC, CacheOp.EXTRACT_DOC_V, pdfSha, scope,
                DerivationKey.sha256Hex(prompt), models.identity(LlmRole.EXTRACT), null, spec.asCacheParams());

        // Narrowed to the key this pass announces and records under. The stage bound
        // `extract` — the declared step — which was precise enough while documents were read
        // one after another, because "the step running now" and "the document running now"
        // were the same fact. They are not any more: with six in flight, every model call and
        // every avoided one would be filed under the same step, and a reader working out
        // which document cost the money would have nothing to read.
        return CallScope.bind(CallScope.current().atStep(stepKey), () -> {
            try {
                var hit = cache.computeIfAbsent(key, Map.class, () -> {
                    List<byte[]> images = renderer.render(pdfSha, pages, spec);
                    VisionResult result = models.read(
                            VisionRequest.of(LlmRole.EXTRACT, images, prompt, pages));
                    return new DerivationCache.Entry<>(result.fields(), null, null, ModelSpend.of(result.usage(), result.model()));
                });

                int offSchema = facts.write(ctx.caseId(), code, pages.get(0), hit.value());
                // Per document rather than per stage, because a cache hit here is the
                // difference between four seconds and four minutes and the officer should
                // see which they got.
                Map<String, Object> what = new LinkedHashMap<>(Map.of("pages", pages));
                if (offSchema > 0) what.put("offSchema", offSchema);
                if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
                    ctx.recordCachedStep(stepKey, what, null, true);
                } else {
                    ctx.recordStep(stepKey, what, true);
                }
                return true;
            } catch (RuntimeException e) {
                // One document that could not be read must not lose the other five.
                log.warn("Extraction failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
                ctx.recordFailedStep(stepKey, e.getMessage());
                return false;
            }
        });
    }

    /**
     * Signatures, seals and corrections — where the dictionary has bound one.
     *
     * <p>Skipped entirely for a document type with no attestation binding, which is most of
     * them. That is the cost control and it is the dictionary's decision, not this class's:
     * UCP demands a signature on a transport document and an insurance document, and says
     * nothing about a packing list, so a twenty-document bundle is three or four looks. An
     * author who needs a signed packing list adds the binding in the console.
     *
     * <p>A document the <em>credit</em> demands a signature on — "certificate of origin
     * signed and stamped by the chamber of commerce" lives in {@code :46A:}, not in UCP — is
     * not knowable here, because the requirement cards have not been read yet. That case is
     * picked up lazily in the examination, against the same cache key.
     */
    private void attest(StageContext ctx, String pdfSha, String code, List<Integer> pages) {
        if (ctx.cancelled() || !attestor.attests(code)) return;
        String stepKey = "attest:" + code;
        ctx.announce(stepKey, "Signatures & stamps · " + docTypes.label(code).toLowerCase());
        CallScope.bind(CallScope.current().atStep(stepKey), () -> {
            try {
                var result = attestor.attest(ctx.caseId(), pdfSha, code, pages);
                Map<String, Object> what = new LinkedHashMap<>(Map.of(
                        "pages", pages, "marks", result.marks()));
                if (result.offSchema() > 0) what.put("offSchema", result.offSchema());
                if (result.cached()) {
                    ctx.recordCachedStep(stepKey, what, null, true);
                } else {
                    ctx.recordStep(stepKey, what, true);
                }
            } catch (RuntimeException e) {
                // One document whose marks could not be read must not lose the fields that were.
                log.warn("Attestation failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
                ctx.recordFailedStep(stepKey, e.getMessage());
            }
        });
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
                                 List<Integer> pages, String scope, RenderSpec spec) {
        if (ctx.cancelled()) return;
        String stepKey = "extract-md:" + code;
        String prompt = prompts.get("extract-doc-md");
        ctx.announce(stepKey, "Layout text · " + docTypes.label(code).toLowerCase());

        var key = new DerivationKey(CacheOp.EXTRACT_DOC_MD, CacheOp.EXTRACT_DOC_MD_V, pdfSha, scope,
                DerivationKey.sha256Hex(prompt), models.identity(LlmRole.EXTRACT), null, spec.asCacheParams());

        CallScope.bind(CallScope.current().atStep(stepKey), () -> {
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
                    ctx.recordCachedStep(stepKey, what, null, true);
                } else {
                    ctx.recordStep(stepKey, what, true);
                }
            } catch (RuntimeException e) {
                log.warn("Layout markdown failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
                ctx.recordFailedStep(stepKey, e.getMessage());
            }
        });
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
