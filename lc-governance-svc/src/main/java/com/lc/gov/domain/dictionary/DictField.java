package com.lc.gov.domain.dictionary;

import java.util.List;

/**
 * One entry in the Dictionary — the vocabulary a check is allowed to name.
 *
 * <p>A check's {@code field_refs} must resolve here. That is what makes the
 * structural signature computable, and it is what the rule editor lints
 * {@code {token}}s against.
 *
 * @param kind LC_FIELD (carries a SWIFT tag) · DOC_DATA_POINT (read off a
 *             document) · DERIVED (computed) · EXTERNAL (from another system).
 *             Only the first two are seeded; the others are authored.
 * @param seeded true when the row came from YAML, so a reseed may overwrite it.
 *               Hand-authored rows are never touched by the seeder.
 */
public record DictField(
        String key,
        String nameEn,
        String nameZh,
        String kind,
        String valueType,
        String fieldGroup,
        List<String> sourceTags,
        List<String> appliesTo,
        boolean ruleRelevant,
        String description,
        boolean seeded) {

    public static final String LC_FIELD = "LC_FIELD";
    public static final String DOC_DATA_POINT = "DOC_DATA_POINT";
    public static final String DERIVED = "DERIVED";
    public static final String EXTERNAL = "EXTERNAL";
}
