package com.tb.helix.lccheck.stage.interpret;

import com.tb.helix.governance.domain.DocType;
import com.tb.helix.lccheck.persistence.Rows;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.model.ModelGateway;
import com.tb.helix.harness.model.ModelRole;
import com.tb.helix.harness.model.VisionRequest;
import com.tb.helix.harness.model.VisionResult;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.stream.HelixEvent;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.pipeline.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Reading the presentation.
 *
 * <p>Two passes, at deliberately different resolutions, because they are different
 * questions:
 *
 * <ul>
 *   <li><b>Segment</b> — "what kind of document is each page?" Answered from layout and
 *       headings, so 800 px is plenty. One call for the whole bundle.
 *   <li><b>Extract</b> — "what does this document say?" Has to read a unit price, so
 *       1600 px. One call per document, over only that document's pages.
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
    private final ModelGateway models;
    private final DerivationCache cache;
    private final CaseStore cases;
    private final ObjectMapper json;

    public InterpretStage(PageRenderer renderer, RenderProperties render, ModelGateway models,
                          DerivationCache cache, CaseStore cases, ObjectMapper json) {
        this.renderer = renderer;
        this.render = render;
        this.models = models;
        this.cache = cache;
        this.cases = cases;
        this.json = json;
    }

    @Override
    public StageId id() {
        return StageId.INTERPRET;
    }

    @Override
    public StageOutcome execute(StageContext ctx) {
        Map<String, Object> row = cases.find(ctx.caseId()).orElseThrow();
        String pdfSha = (String) row.get("bundle_pdf_sha");
        if (pdfSha == null) return StageOutcome.failed("No presentation bundle on this case.");

        int pages = renderer.pageCount(pdfSha);
        if (pages > render.maxBundlePages()) {
            // Refuse rather than truncate. Examining the first 300 pages of 400 looks
            // exactly like examining all of them, and that is the worse failure.
            return StageOutcome.failed("This bundle has " + pages + " pages; the limit is "
                    + render.maxBundlePages() + ". Split it or raise helix.render.max-bundle-pages.");
        }

        Map<Integer, String> byPage = segment(ctx, pdfSha, pages);
        writeDocuments(ctx, byPage, pages);
        extractAll(ctx, pdfSha, byPage);

        cases.patchCase(ctx.caseId(), Map.of("status", "to_decide"));
        return StageOutcome.ok();
    }

    // --- Segmentation -------------------------------------------------------

    private Map<Integer, String> segment(StageContext ctx, String pdfSha, int pageCount) {
        List<Integer> all = new ArrayList<>();
        for (int i = 1; i <= pageCount; i++) all.add(i);

        var spec = render.specFor("segment");
        var key = new DerivationKey(CacheOp.SEGMENT_BUNDLE, CacheOp.SEGMENT_BUNDLE_V, pdfSha,
                "1-" + pageCount, DerivationKey.sha256Hex(SEGMENT_PROMPT), "role:segment", null,
                spec.asCacheParams());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            List<byte[]> images = renderer.render(pdfSha, all, spec);
            VisionResult result = models.read(VisionRequest.of(ModelRole.SEGMENT, images,
                    SEGMENT_PROMPT.replace("{PAGES}", String.valueOf(pageCount)), all));
            return DerivationCache.Entry.of(result.fields());
        });

        if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
            ctx.recordCachedStep("segment", Map.of("pages", pageCount), null);
        } else {
            ctx.recordStep("segment", Map.of("pages", pageCount));
        }

        Map<Integer, String> byPage = readPageMap(hit.value(), pageCount);
        // Progress arrives per page rather than at the end: the UI counts documents
        // carved out of the bundle, and a single jump from 0 to 6 reads as a stall.
        for (int p = 1; p <= pageCount; p++) {
            ctx.emit(HelixEvent.SEGMENT, Map.of("done", p, "total", pageCount));
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
                        if (page != null) out.put(page, DocType.ALL.containsKey(type) ? type : "UNKNOWN");
                    }
                }
            }
        }
        // A page the model did not mention is not silently dropped — it becomes UNKNOWN,
        // which the officer can see and reclassify. A missing page is invisible.
        for (int p = 1; p <= pageCount; p++) out.putIfAbsent(p, "UNKNOWN");
        return out;
    }

    private void writeDocuments(StageContext ctx, Map<Integer, String> byPage, int pageCount) {
        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        byPage.forEach((page, code) -> grouped.computeIfAbsent(code, k -> new ArrayList<>()).add(page));

        int ordinal = 1;
        for (var entry : grouped.entrySet()) {
            var def = DocType.of(entry.getKey());
            List<Integer> pages = entry.getValue().stream().sorted().toList();
            cases.upsertDocument(ctx.caseId(), def.code(), Rows.of(
                    "role", "presented", "docType", def.label(), "abbr", def.abbr(),
                    "icon", def.icon(), "fileName", "bundle",
                    "pageFrom", pages.get(0), "pageTo", pages.get(pages.size() - 1),
                    "pages", pages, "extraction", "ocr", "ordinal", ordinal++));
        }
        byPage.forEach((page, code) ->
                cases.setBundlePage(ctx.caseId(), page, code, DocType.of(code).label()));
    }

    // --- Extraction ---------------------------------------------------------

    private void extractAll(StageContext ctx, String pdfSha, Map<Integer, String> byPage) {
        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        byPage.forEach((page, code) -> {
            if (!"UNKNOWN".equals(code)) grouped.computeIfAbsent(code, k -> new ArrayList<>()).add(page);
        });

        var spec = render.specFor("extract");
        for (var entry : grouped.entrySet()) {
            if (ctx.cancelled()) return;
            String code = entry.getKey();
            List<Integer> pages = entry.getValue().stream().sorted().toList();
            String scope = code + "|" + pages.get(0) + "-" + pages.get(pages.size() - 1);
            String prompt = extractPrompt(code);

            var key = new DerivationKey(CacheOp.EXTRACT_DOC, CacheOp.EXTRACT_DOC_V, pdfSha, scope,
                    DerivationKey.sha256Hex(prompt), "role:extract", null, spec.asCacheParams());

            try {
                var hit = cache.computeIfAbsent(key, Map.class, () -> {
                    List<byte[]> images = renderer.render(pdfSha, pages, spec);
                    VisionResult result = models.read(
                            VisionRequest.of(ModelRole.EXTRACT, images, prompt, pages));
                    return DerivationCache.Entry.of(result.fields());
                });

                writeFacts(ctx, code, pages.get(0), hit.value());
                if (hit.tier() != com.tb.helix.infra.cache.CacheTier.Level.NONE) {
                    ctx.recordCachedStep("extract:" + code, Map.of("pages", pages), null);
                } else {
                    ctx.recordStep("extract:" + code, Map.of("pages", pages));
                }
            } catch (RuntimeException e) {
                // One document that could not be read must not lose the other five.
                log.warn("Extraction failed for {} on case {}: {}", code, ctx.caseId(), e.toString());
                ctx.recordFailedStep("extract:" + code, e.getMessage());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void writeFacts(StageContext ctx, String docCode, int firstPage, Object value) {
        if (!(value instanceof Map<?, ?> map)) return;
        for (var e : map.entrySet()) {
            String label = String.valueOf(e.getKey());
            Object v = e.getValue();
            if (v == null || label.startsWith("_")) continue;
            // Nested objects are the model elaborating where a flat value was asked for.
            // Kept as JSON rather than dropped: an officer can still read it.
            String text = v instanceof Map || v instanceof List ? toJson(v) : String.valueOf(v);
            if (text.isBlank()) continue;

            cases.upsertFact(ctx.caseId(), Rows.of(
                    "docId", docCode,
                    "label", humanise(label),
                    "fieldKey", label,
                    "value", text,
                    "valueNorm", text.strip().toUpperCase(),
                    "page", firstPage,
                    "source", "p." + firstPage,
                    "confidence", "MED"));
        }
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

    private static final String SEGMENT_PROMPT = """
            You are sorting the pages of a trade-finance presentation.

            There are {PAGES} page images, in order, starting at page 1. For each one, say
            which kind of document it is. Judge from headings, layout and the parties named —
            not from what you expect the order to be.

            Document types:
            """ + DocType.vocabulary() + """

            If a page does not clearly belong to any of these, use UNKNOWN. Guessing is worse
            than saying so: a wrong type sends the wrong rules at the document.

            A document may run over several pages. Give every page its own entry.

            Return only JSON:
            {"pages": [{"page": 1, "docType": "INV", "why": "short reason"}, ...]}
            """;

    private static String extractPrompt(String code) {
        var def = DocType.of(code);
        return """
                Read this %s and return the fields written on it.

                Rules:
                - Copy values exactly as printed. Do not normalise, reformat or convert.
                - Dates in ISO form (YYYY-MM-DD) only when the printed form is unambiguous;
                  otherwise copy what is printed.
                - Amounts with their currency, as shown.
                - Omit a field entirely rather than guessing. A missing value is a fact an
                  examiner can act on; an invented one is not.

                Use snake_case keys naming what the document itself calls the field —
                invoice_number, goods_description, gross_weight, vessel_name, on_board_date,
                beneficiary_name, applicant_name, total_amount, currency, quantity,
                unit_price, port_of_loading, port_of_discharge, presentation_date, and any
                other field actually present.

                Return only JSON: a flat object of field name to value.
                """.formatted(def.label().toLowerCase());
    }
}
