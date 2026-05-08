package com.lc.v2.checker.domain.document;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.lc.v2.checker.domain.common.BBox;
import java.util.List;

/**
 * Anything on the document that *could* bear on an LC compliance check, beyond
 * the predefined field-pool schema. Captured from the vision pass with
 * verbatim quote and provenance so AGENT rules can reason over evidence the
 * extractor didn't have a field key for.
 *
 * Examples:
 *   - hand-stamped freight clauses on a B/L
 *   - "FREIGHT PREPAID AT LOAD PORT" notation
 *   - defect notations ("BAGS TORN, CONTENTS LEAKING")
 *   - additional certifications, contract references, package marks,
 *     pre-printed warranties
 *
 * The {@code rawQuote} field is the spine: every item must carry the verbatim
 * source text. {@code tags[]} is the extractor's best guess at category
 * (e.g. ["freight_terms", "incoterm_signal"]); the rule layer interprets.
 *
 * Legacy fields ({@code kind}, {@code value}, {@code fieldHint}, {@code location},
 * {@code original}, {@code authenticated}) are preserved for back-compat with
 * earlier vision-pass shapes that classified items as
 * "handwritten" / "stamp" / "watermark" / "correction". New items should
 * primarily populate {@code rawQuote} + {@code tags}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OffSchemaItem(
        String rawQuote,
        List<String> tags,
        Integer page,
        BBox bbox,
        Double confidence,
        // legacy fields — preserved for back-compat
        String kind,
        String value,
        String fieldHint,
        String location,
        String original,
        Boolean authenticated
) {
    public static OffSchemaItem ofQuote(String rawQuote, Integer page, Double confidence, List<String> tags) {
        return new OffSchemaItem(rawQuote, tags, page, null, confidence,
                null, null, null, null, null, null);
    }

    public boolean hasTag(String tag) {
        return tags != null && tags.contains(tag);
    }
}
