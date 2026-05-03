package com.lc.v2.checker.domain.common;

/**
 * UCP 600 or ISBP 821 article referenced by rule catalog entries.
 * Loaded from resources/refs/ucp600.yaml and isbp821.yaml via ArticleRefRegistry.
 *
 * Served to UI via GET /api/v2/refs/{id} for hover tooltips.
 * Injected into prompts by template resolution using the ID.
 */
public record ArticleRef(
        String id,
        String source,
        String article,
        String paragraph,
        String heading,
        String text
) {
    public String displayTitle() {
        return paragraph != null && !paragraph.isBlank()
                ? source + " Art. " + article + "(" + paragraph + ")"
                : source + " Art. " + article;
    }
}
