package com.tb.helix.lccheck.service;

import com.tb.helix.harness.doc.PageRenderer;
import com.tb.helix.harness.doc.RenderProperties;
import com.tb.helix.harness.doc.RenderSpec;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.vision.VisionRequest;
import com.tb.helix.harness.llm.vision.VisionResult;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.CacheTier;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.prompt.Prompts;
import com.tb.helix.lccheck.persistence.CaseStore;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Looking at a document, rather than reading it.
 *
 * <p>Is it signed, and in what capacity. Is it an original. Is the correction initialled. Is
 * the clause pre-printed or added. None of those are answerable from a transcription, and
 * several of them are what UCP 600 actually requires:
 *
 * <ul>
 *   <li><b>art. 3</b> — a signature may be handwriting, a facsimile, a perforation, a stamp,
 *       a symbol or any mechanical or electronic authentication. A printed company chop is a
 *       signature; reporting such a document as unsigned is a false discrepancy.
 *   <li><b>art. 20(a)(i)</b> — a bill of lading must be signed <em>and show capacity</em>.
 *       "ABC Shipping" is not enough; "ABC Shipping, as agent for XYZ Lines, the carrier" is.
 *   <li><b>art. 17</b> — an apparently original signature, mark, stamp or label is what makes
 *       a document an original.
 *   <li><b>art. 27</b> — an added clause declaring defective condition makes a transport
 *       document unclean, where identical pre-printed boilerplate does not.
 *   <li><b>ISBP 821 §A</b> — a correction on a document not issued by the beneficiary must
 *       appear authenticated.
 * </ul>
 *
 * <h2>Why a service and not a stage</h2>
 *
 * <p>Two callers. The reading attests every document the dictionary has bound an attestation
 * to; the examination attests a document the <em>credit</em> demanded one on — "certificate
 * of origin signed and stamped by the chamber of commerce" is in {@code :46A:}, not in UCP,
 * and is not knowable until the requirement cards have been read. Both go through here, both
 * produce the same cache key, so the second look at a document is a hit and not a second bill.
 *
 * <h2>Why it costs less than it looks</h2>
 *
 * <p>The pass runs only where the dictionary has bound an attestation, which is the document
 * types UCP names — transport, insurance, the draft. A twenty-document bundle is three or
 * four looks, not twenty. It reuses the field pass's {@link RenderSpec} exactly, so the PNG
 * render is a cache hit; and with images leading the request, the image tokens ride the
 * prefix the field pass already paid for.
 */
@Component
public class DocumentAttestor {

    /**
     * The kinds a mark may be. Anything else the model invents is dropped rather than
     * written, because the column constrains them and a rejected insert would lose the
     * whole document's marks rather than the one that was wrong.
     */
    private static final Set<String> KINDS = Set.of(
            "signature", "seal", "stamp", "handwriting",
            "correction", "tick", "strikethrough", "label");

    private static final Set<String> CONFIDENCE = Set.of("HIGH", "MED", "LOW");

    private final PageRenderer renderer;
    private final RenderProperties render;
    private final LlmGateway models;
    private final DerivationCache cache;
    private final CaseStore cases;
    private final DocumentTypes docTypes;
    private final ExtractionSpec spec;
    private final FactWriter facts;
    private final Prompts prompts;

    public DocumentAttestor(PageRenderer renderer, RenderProperties render, LlmGateway models,
                            DerivationCache cache, CaseStore cases, DocumentTypes docTypes,
                            ExtractionSpec spec, FactWriter facts, Prompts prompts) {
        this.renderer = renderer;
        this.render = render;
        this.models = models;
        this.cache = cache;
        this.cases = cases;
        this.docTypes = docTypes;
        this.spec = spec;
        this.facts = facts;
        this.prompts = prompts;
    }

    /**
     * What one look produced, for the stage to put on the tape.
     *
     * @param offSchema attestation keys the dictionary did not recognise
     * @param cached    whether this cost a model call. Per document rather than per stage,
     *                  because it is the difference between four seconds and forty and the
     *                  officer should see which they got.
     */
    public record Attestation(String docCode, List<Integer> pages, int marks, int offSchema,
                              boolean cached) {
    }

    /** Whether this document type is one the dictionary asks to be looked at. */
    public boolean attests(String docCode) {
        return spec.attests(docCode);
    }

    /**
     * Looks at one document and records what is on it.
     *
     * <p>Attestation values go to {@code lc_fact} under dictionary keys, because that is what
     * an exact rule joins on. The marks go to {@code lc_mark} as the evidence behind them —
     * what the officer opens when a rule says "unsigned" and they want to see why.
     */
    public Attestation attest(String caseId, String pdfSha, String docCode, List<Integer> pages) {
        // Deliberately the field pass's spec, named rather than defaulted. specFor("attest")
        // would fall back to a profile that happens to match today and would stop matching
        // the moment somebody tuned extract — and the two silently rendering at different
        // sizes is exactly the shared-render saving disappearing with nothing to show it.
        RenderSpec renderSpec = render.specFor("extract");
        String scope = docCode + "|" + pages.get(0) + "-" + pages.get(pages.size() - 1);
        String prompt = prompt(docCode);

        var key = new DerivationKey(CacheOp.ATTEST_DOC, CacheOp.ATTEST_DOC_V, pdfSha, scope,
                DerivationKey.sha256Hex(prompt), "role:attest", null, renderSpec.asCacheParams());

        var hit = cache.computeIfAbsent(key, Map.class, () -> {
            List<byte[]> images = renderer.render(pdfSha, pages, renderSpec);
            VisionResult result = models.read(
                    VisionRequest.of(LlmRole.EXTRACT, images, prompt, pages));
            return new DerivationCache.Entry<>(result.fields(), null, null,
                    ModelSpend.of(result.usage(), result.model()));
        });

        int page = pages.get(0);
        Object fields = fieldsOf(hit.value());
        List<Map<String, Object>> marks = marksOf(hit.value(), page);

        int offSchema = facts.write(caseId, docCode, page, fields, true, contradictions(fields, marks));
        cases.replaceMarks(caseId, docCode, marks);
        cases.setDocumentAttested(caseId, docCode);

        return new Attestation(docCode, pages, marks.size(), offSchema,
                hit.tier() != CacheTier.Level.NONE);
    }

    /**
     * The rubric, plus this document's own bindings.
     *
     * <p>The rubric is domain knowledge and lives in the prompt file. The list of
     * attestations to report is the dictionary's, so adding one in the console changes the
     * next reading and there is no template to remember to update.
     */
    private String prompt(String docCode) {
        // Presence first, and unconditionally. These five are the reason the pass runs at
        // all, so they are asked of every document that reaches it — not left to whether an
        // author happened to bind them here.
        StringBuilder asked = new StringBuilder(
                "Answer all of these, under exactly these names, inside `fields`:\n\n");
        asked.append(spec.presenceLines());

        // Then whatever this particular document additionally wants: a signature's capacity
        // on a bill of lading, the freight notation, how many originals were issued.
        String extra = spec.attestationLines(docCode);
        if (!extra.isBlank()) {
            asked.append("\nAnd these, which matter on this document in particular:\n\n")
                    .append(extra);
        }

        return prompts.fill("attest-doc", Map.of(
                "docType", docTypes.label(docCode).toLowerCase(),
                "asked", asked.toString()));
    }

    /**
     * Where the conclusion and the evidence disagree.
     *
     * <p>Nothing stops a model answering {@code signed: NO} and then listing a signature, and
     * until now both would have been stored with nothing to say they cannot both be right.
     * Flagged rather than repaired: UCP 600 art. 3 makes a stamp a signature, so whether a
     * given chop signs the document is a judgement, and code silently overruling the model in
     * either direction would be making that judgement invisibly.
     */
    private static Map<String, String> contradictions(Object fields,
                                                      List<Map<String, Object>> marks) {
        if (!(fields instanceof Map<?, ?> f)) return Map.of();
        Map<String, String> out = new LinkedHashMap<>();

        check(out, f, marks, "signed", Set.of("signature"),
                "Reported unsigned, but a signature was found on the page.",
                "Reported signed, but no signature, seal or stamp was found.",
                Set.of("signature", "seal", "stamp"));
        check(out, f, marks, "seal_present", Set.of("seal", "stamp"),
                "Reported unsealed, but a seal or stamp was found on the page.",
                "Reported sealed, but no seal or stamp was found.",
                Set.of("seal", "stamp"));
        check(out, f, marks, "corrections_present", Set.of("correction", "strikethrough"),
                "Reported free of corrections, but a correction was found on the page.",
                "Reported corrected, but no correction was found.",
                Set.of("correction", "strikethrough"));
        return out;
    }

    private static void check(Map<String, String> out, Map<?, ?> fields,
                              List<Map<String, Object>> marks, String key,
                              Set<String> saysYes, String noButFound, String yesButNone,
                              Set<String> saysNo) {
        String value = str(fields.get(key));
        if (value == null) return;
        boolean claimed = value.equalsIgnoreCase("YES");
        boolean denied = value.equalsIgnoreCase("NO");
        if (!claimed && !denied) return;

        boolean found = marks.stream().anyMatch(m -> saysYes.contains(String.valueOf(m.get("kind"))));
        boolean any = marks.stream().anyMatch(m -> saysNo.contains(String.valueOf(m.get("kind"))));
        if (denied && found) out.put(key, noButFound);
        if (claimed && !any) out.put(key, yesButNone);
    }

    /**
     * The {@code fields} half of the envelope, with booleans spelled the way rules read them.
     *
     * <p>A JSON {@code true} would be stored as the string "true", and an authored rule
     * comparing {@code signed} against "YES" would then report every signed document
     * unsigned — a false discrepancy that looks exactly like a real one. The prompt asks for
     * YES and NO; this is the belt to that pair of braces, because the failure is silent and
     * the fix is two lines.
     */
    private static Object fieldsOf(Object value) {
        if (!(value instanceof Map<?, ?> map) || !(map.get("fields") instanceof Map<?, ?> f)) {
            return Map.of();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        f.forEach((k, v) -> {
            if (v instanceof Boolean b) {
                out.put(String.valueOf(k), b ? "YES" : "NO");
                return;
            }
            // The literal string "null" has to go, and this is the only place it can. A
            // rule like CLEAN-27 asks whether adverse clausing is ABSENT, and absence is
            // read as "no fact was written". A fact whose value is the four characters
            // n-u-l-l is present, so the clean bill of lading is reported as clause-bearing.
            String text = v == null ? null : String.valueOf(v).strip();
            if (text == null || text.isEmpty()
                    || text.equalsIgnoreCase("null") || text.equalsIgnoreCase("n/a")) {
                return;
            }
            out.put(String.valueOf(k), v);
        });
        return out;
    }

    /**
     * The {@code marks} half, cleaned to what the column will accept.
     *
     * <p>A model that answers {@code "kind": "chop"} is not wrong about the world — it is
     * wrong about this vocabulary, and the row would be rejected. Folding the near-misses is
     * worth the six lines; dropping the rest is better than losing the document's whole set
     * to one bad enum.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> marksOf(Object value, int fallbackPage) {
        if (!(value instanceof Map<?, ?> map)) return List.of();
        if (!(map.get("marks") instanceof List<?> list)) return List.of();

        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) continue;
            String kind = kind(str(m.get("kind")));
            if (kind == null) continue;

            // One mark per distinct thing on the page. A beneficiary certificate with a
            // tick beside each of nineteen printed clauses came back as nineteen identical
            // handwriting marks, which buried the two that mattered — the seal and the
            // illegible signature — under a list nobody would read to the end of. The
            // prompt asks for this too; a model enumerating a form is common enough that
            // the panel should not depend on it obeying.
            String identity = kind + "|" + page(m, fallbackPage) + "|" + lower(str(m.get("readsAs")))
                    + "|" + lower(str(m.get("party"))) + "|" + lower(str(m.get("capacity")));
            if (!seen.add(identity)) continue;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("kind", kind);
            row.put("page", page(m, fallbackPage));
            row.put("placement", str(m.get("placement")));
            row.put("readsAs", str(m.get("readsAs")));
            row.put("party", str(m.get("party")));
            row.put("capacity", str(m.get("capacity")));
            row.put("medium", str(m.get("medium")));
            row.put("authenticates", str(m.get("authenticates")));
            // A mark reported with no text is one the model could not read. Defaulting that
            // to legible would erase the distinction the whole pass exists to keep: present
            // but unreadable is not the same as absent, and only absent is a discrepancy.
            Object legible = m.get("legible");
            row.put("legible", legible == null ? str(m.get("readsAs")) != null : !Boolean.FALSE.equals(legible));
            String conf = str(m.get("confidence"));
            row.put("confidence", conf != null && CONFIDENCE.contains(conf.toUpperCase())
                    ? conf.toUpperCase() : "MED");
            out.add(row);
        }
        return out;
    }

    private static String kind(String raw) {
        if (raw == null) return null;
        String k = raw.trim().toLowerCase().replace(' ', '_').replace('-', '_');
        if (KINDS.contains(k)) return k;
        return switch (k) {
            case "chop", "company_chop", "official_seal" -> "seal";
            case "date_stamp", "rubber_stamp", "endorsement" -> "stamp";
            case "manuscript", "handwritten", "initials", "annotation" -> "handwriting";
            case "alteration", "amendment", "overwrite" -> "correction";
            case "checkbox", "tick_box", "checked_box" -> "tick";
            case "struck_through", "deletion", "strike_through" -> "strikethrough";
            case "watermark", "sticker" -> "label";
            default -> null;
        };
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).strip();
        // "null" and "N/A" arrive as strings often enough to be worth naming. Stored as
        // themselves they would read on screen as a value the document carries.
        return s.isEmpty() || s.equalsIgnoreCase("null") || s.equalsIgnoreCase("n/a") ? null : s;
    }

    private static int page(Map<?, ?> mark, int fallback) {
        return asInt(mark.get("page"), fallback);
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(java.util.Locale.ROOT);
    }

    private static int asInt(Object o, int fallback) {
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o).strip());
        } catch (Exception e) {
            return fallback;
        }
    }
}
