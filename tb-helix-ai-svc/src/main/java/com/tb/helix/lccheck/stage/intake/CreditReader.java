package com.tb.helix.lccheck.stage.intake;

import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * What a SWIFT message means, read by a model.
 *
 * <p>The structure comes from {@link SwiftReader}; the meaning comes from here. That split
 * is the point: splitting on {@code :NN:} needs no judgement and must never vary, while
 * deciding that {@code :31D:241231SINGAPORE} means an expiry of 2024-12-31 at Singapore is
 * exactly the kind of reading a regular expression does badly.
 *
 * <p>Why not a parser. The one this replaces handled four date shapes, two amount
 * conventions and a comma that means a decimal point — and every real message brought a
 * fifth. Tag semantics also differ by message type, so a parser has to grow a branch per
 * type while a prompt just says which type it is reading. Determinism is not lost: the call
 * is at temperature 0 and cached on the message digest, so the same credit reads the same
 * way forever and costs one call ever.
 *
 * <p>Same shape as document extraction, one layer down: a prompt, a schema, a cached
 * derivation. It is a text call rather than a vision one because a SWIFT message is text —
 * rendering it to an image to read it back would be absurd.
 */
@Component
public class CreditReader {

    private static final Logger log = LoggerFactory.getLogger(CreditReader.class);

    private final LlmGateway models;
    private final DerivationCache cache;
    private final ObjectMapper json;

    public CreditReader(LlmGateway models, DerivationCache cache, ObjectMapper json) {
        this.models = models;
        this.cache = cache;
        this.json = json;
    }

    /**
     * The terms, or the changes, depending on what arrived.
     *
     * <p>Never throws. A message that cannot be read leaves the case with its raw text and
     * no terms, which the officer can see and correct — better than an intake that fails and
     * leaves nothing at all.
     */
    public Map<String, Object> read(SwiftMessage message) {
        if (message.type() == SwiftMessageType.MT799 || message.type() == SwiftMessageType.UNKNOWN) {
            // Nothing structured to extract. The text is stored and shown; inventing fields
            // from a covering note would put values on a case that no document supports.
            return Map.of();
        }

        String prompt = prompt(message);
        var key = new DerivationKey(CacheOp.EXTRACT_CREDIT, CacheOp.EXTRACT_CREDIT_V,
                DerivationKey.sha256Hex(message.block4()), message.type().code(),
                DerivationKey.sha256Hex(prompt), "role:read_text", null, Map.of());

        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                var result = models.complete(TextRequest.json(LlmRole.READ_TEXT, SYSTEM, prompt));
                return DerivationCache.Entry.of(parse(result.content()));
            });
            @SuppressWarnings("unchecked")
            Map<String, Object> fields = (Map<String, Object>) hit.value();
            return clean(fields == null ? Map.of() : fields);

        } catch (RuntimeException e) {
            log.warn("Could not read {} ({}): {}", message.type().code(), message.type().label(), e.toString());
            return Map.of();
        }
    }

    private String prompt(SwiftMessage message) {
        return message.type().isAmendment()
                ? AMENDMENT_PROMPT.formatted(message.block4())
                : CREDIT_PROMPT.formatted(message.block4());
    }

    /**
     * Drops what the model said it did not find.
     *
     * <p>Absent has to survive as absent. On an amendment especially: a field the model
     * returns as null or "" would overwrite the original credit's value with nothing, and a
     * 707 that mentions only the expiry would silently erase the beneficiary.
     */
    private Map<String, Object> clean(Map<String, Object> fields) {
        Map<String, Object> out = new LinkedHashMap<>();
        fields.forEach((k, v) -> {
            if (v == null) return;
            if (v instanceof String s && (s.isBlank() || s.equalsIgnoreCase("null"))) return;
            out.put(k, v);
        });
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String content) {
        try {
            return json.readValue(content, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("The credit reading was not valid JSON: " + e.getMessage(), e);
        }
    }

    private static final String SYSTEM = """
            You read SWIFT documentary-credit messages and report what they say.

            You are not examining anything and not advising. You are stating the terms so a
            colleague can measure documents against them.

            Rules you do not depart from:

            1. Report only what the message says. A field that is not there is absent, not
               empty and not inferred from another field.
            2. SWIFT writes decimals with a comma. USD60000,00 is sixty thousand.
            3. Dates in tags are YYMMDD. Return ISO — 2024-12-31 — and nothing else.
            4. Where a tag carries a date and a place (31D), separate them.
            5. Never round, never convert currency, never tidy a party name.

            Answer only in the JSON shape you are given. No prose outside it.
            """;

    private static final String FIELDS = """
              creditRef          :20:  the credit's own reference
              issuedDate         :31C: ISO
              applicant          :50:  first line — the name
              beneficiary        :59:  first line — the name
              currency           :32B: the three-letter code
              amount             :32B: a number, decimal point, no separators
              tolerancePct       :39A: the plus percentage, 0 when absent
              latestShipment     :44C: ISO
              expiry             :31D: ISO — the date part only
              expiryPlace        :31D: the place part only
              presentationDays   :48:  a whole number of days
              tenor              :42C: as written
              goods              :45A: as written, newlines kept
              availableWith      :41D: or :41A: — first line
              requiredDocs       :46A: as written, newlines kept
              conditions         :47A: as written, newlines kept
            """;

    private static final String CREDIT_PROMPT = """
            This is the text of an MT700, the issue of a documentary credit.

            ---
            %s
            ---

            Report these fields. Omit any the message does not carry — do not guess, and do
            not carry a value across from a similar tag.

            """ + FIELDS + """

            Return only a flat JSON object of those names to values.
            """;

    private static final String AMENDMENT_PROMPT = """
            This is the text of an MT707, an amendment to a documentary credit.

            ---
            %s
            ---

            An amendment carries only what changed. Report ONLY the fields this message
            actually states. Everything you omit will be left as the original credit has it,
            so a field you include with a guessed value overwrites something correct.

            """ + FIELDS + """

            Also report:
              amendedCreditRef   :21: the credit this amends
              amendmentNumber    :26E: if present

            Return only a flat JSON object.
            """;
}
