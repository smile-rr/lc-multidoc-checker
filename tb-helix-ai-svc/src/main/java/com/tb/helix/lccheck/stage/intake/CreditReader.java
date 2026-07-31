package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.infra.prompt.Prompts;
import com.tb.helix.lccheck.service.DocumentTypes;
import com.tb.helix.lccheck.service.ExtractionSpec;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a credit file means, read by a model.
 *
 * <p>The structure comes from {@link SwiftReader}; the meaning comes from here. That split
 * is the point: cutting on {@code :NN:} needs no judgement and must never vary, while
 * deciding that {@code :31D:241231SINGAPORE} means an expiry of 2024-12-31 at Singapore —
 * and that the MT707 two messages later moved it to March — is exactly the reading a regular
 * expression does badly.
 *
 * <p><b>One call over the whole file.</b> The alternative is a call per message and a fold in
 * Java, and it is worse in the way that matters: applying an amendment is not a merge of two
 * maps. A 707 says "expiry now 31 March" in one bank's wording and "the latest date for
 * presentation is extended by 30 days" in another's; the second needs the original to be
 * computed at all, and a fold that has already thrown the original away cannot do it. So the
 * model is shown the file, in order, and asked what the terms now are.
 *
 * <p>Why not a parser. The one this replaced handled four date shapes, two amount
 * conventions and a comma that means a decimal point — and every real message brought a
 * fifth. Determinism is not lost: the call is at temperature 0 and cached on the digest of
 * the whole file, so the same upload reads the same way forever and costs one call ever.
 */
@Component
public class CreditReader {

    private static final Logger log = LoggerFactory.getLogger(CreditReader.class);

    /** Where the model reports which message each term came from. */
    public static final String PROVENANCE = "_from";

    private final LlmGateway models;
    private final DerivationCache cache;
    private final DocumentTypes docTypes;
    private final ExtractionSpec spec;
    private final Prompts prompts;
    private final ObjectMapper json;

    public CreditReader(LlmGateway models, DerivationCache cache, DocumentTypes docTypes,
                        ExtractionSpec spec, Prompts prompts, ObjectMapper json) {
        this.models = models;
        this.cache = cache;
        this.docTypes = docTypes;
        this.spec = spec;
        this.prompts = prompts;
        this.json = json;
    }

    /**
     * The terms as they now stand, after every amendment in the file.
     *
     * <p>Never throws. A file that cannot be read leaves the case with its raw text and no
     * terms, which the officer can see and correct — better than an intake that fails and
     * leaves nothing at all.
     */
    public Reading read(SwiftFile file) {
        if (file.messages().isEmpty()) return Reading.empty();

        String prompt = prompt(file);
        var key = new DerivationKey(CacheOp.EXTRACT_CREDIT, CacheOp.EXTRACT_CREDIT_V,
                DerivationKey.sha256Hex(file.raw()), scope(file),
                // The prompt is assembled from the dictionary, so its hash carries the
                // bindings: change a read note in the console and the credit is read again
                // rather than answered from a cache that used the old instruction.
                DerivationKey.sha256Hex(prompt), "role:read_text", null, Map.of());

        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                var result = models.complete(TextRequest.json(LlmRole.READ_TEXT, prompts.get("credit-system"), prompt));
                return DerivationCache.Entry.of(parse(result.content()));
            });
            @SuppressWarnings("unchecked")
            Map<String, Object> fields = (Map<String, Object>) hit.value();
            return split(fields == null ? Map.of() : fields);

        } catch (RuntimeException e) {
            log.warn("Could not read the credit file ({} messages): {}", file.messages().size(), e.toString());
            return Reading.empty();
        }
    }

    /**
     * The terms, and where each of them came from.
     *
     * @param terms      field name to value, ready for {@code lc_case}
     * @param provenance field name to the message that last stated it — {@code "#3 MT707"}.
     *                   Kept apart from the terms so nothing has to filter it back out, and
     *                   so the workbench can say <em>why</em> the expiry is what it is.
     */
    public record Reading(Map<String, Object> terms, Map<String, Object> provenance) {
        static Reading empty() {
            return new Reading(Map.of(), Map.of());
        }

        public boolean isEmpty() {
            return terms.isEmpty();
        }
    }

    /** The message list, so two files with the same bytes but different framing key apart. */
    private String scope(SwiftFile file) {
        return file.messages().stream().map(m -> m.type().code()).reduce((a, b) -> a + "+" + b).orElse("-");
    }

    private String prompt(SwiftFile file) {
        StringBuilder body = new StringBuilder();
        for (SwiftMessage m : file.messages()) {
            body.append("=== MESSAGE ").append(m.designation())
                .append(" — ").append(m.type().label()).append(" ===\n")
                .append(m.block4().strip()).append("\n\n");
        }
        return prompts.fill("credit-read", Map.of(
                "count", file.messages().size(),
                "messages", body.toString().strip(),
                "fields", fields()));
    }

    /**
     * The terms to ask for — the credit's own dictionary bindings.
     *
     * <p>This was sixteen lines of Java naming fields and their SWIFT tags, which is the
     * same list the dictionary holds and an author can edit. Two copies of one thing, and
     * only one of them was visible to the people who maintain the vocabulary.
     *
     * <p>The note on each binding is the tag guidance, verbatim: "Tag 31D — first six
     * digits, YYMMDD" is an instruction someone wrote in the console, and it goes to the
     * model unchanged.
     */
    private String fields() {
        String lines = spec.fieldLines(docTypes.creditCode());
        return lines.isBlank()
                ? "  (the dictionary has no fields bound to the credit — report what the messages state)\n"
                : lines;
    }

    /**
     * Separates the terms from the note of where they came from.
     *
     * <p>Also drops what the model said it did not find. Absent has to survive as absent: a
     * field returned as null or {@code ""} would overwrite a value the credit actually
     * carries, and a file whose amendment mentions only the expiry would erase the
     * beneficiary.
     */
    private Reading split(Map<String, Object> fields) {
        Map<String, Object> terms = new LinkedHashMap<>();
        Map<String, Object> from = new LinkedHashMap<>();

        Object provenance = fields.get(PROVENANCE);
        if (provenance instanceof Map<?, ?> p) {
            p.forEach((k, v) -> {
                if (v != null) from.put(String.valueOf(k), v);
            });
        }
        fields.forEach((k, v) -> {
            if (k.startsWith("_") || v == null) return;
            if (v instanceof String s && (s.isBlank() || s.equalsIgnoreCase("null"))) return;
            terms.put(k, v);
        });
        return new Reading(terms, from);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String content) {
        try {
            return json.readValue(content, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("The credit reading was not valid JSON: " + e.getMessage(), e);
        }
    }


}
