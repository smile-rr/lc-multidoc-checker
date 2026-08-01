package com.tb.helix.harness.llm.vision;

import com.tb.helix.harness.llm.LlmRole;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Read these pages.
 *
 * <p>Pages arrive as an ordered list of PNG bytes, already rendered. Rendering lives
 * outside this call on purpose: whether the pages need rendering at all depends on the
 * cache, and the cache is consulted before any of this is built. A request that carried a
 * PDF and rendered it internally would render on every cache hit.
 *
 * @param role       {@link LlmRole#SEGMENT}, {@link LlmRole#EXTRACT} or
 *                   {@link LlmRole#TRANSCRIBE}
 * @param pages      PNG bytes, in page order. Order is meaningful — a two-page invoice
 *                   read backwards yields plausible nonsense.
 * @param prompt     the extraction spec: which fields, of what type, with what provenance
 * @param pageLabels human-facing page numbers matching {@code pages}, so an extracted
 *                   value can cite the bundle page it came from rather than an index
 *                   into this list
 * @param overrides  per-call additions to the request body
 */
public record VisionRequest(
        LlmRole role,
        List<byte[]> pages,
        String prompt,
        List<Integer> pageLabels,
        Map<String, Object> overrides) {

    public VisionRequest {
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(prompt, "prompt");
        pages = pages == null ? List.of() : List.copyOf(pages);
        pageLabels = pageLabels == null ? List.of() : List.copyOf(pageLabels);
        if (!pageLabels.isEmpty() && pageLabels.size() != pages.size()) {
            // Silently tolerating this would misattribute every value on every page after
            // the mismatch, and the answer would still look entirely reasonable.
            throw new IllegalArgumentException(
                    "pageLabels must match pages one for one: " + pageLabels.size() + " vs " + pages.size());
        }
        overrides = overrides == null ? Map.of() : Map.copyOf(overrides);
    }

    public static VisionRequest of(LlmRole role, List<byte[]> pages, String prompt, List<Integer> pageLabels) {
        return new VisionRequest(role, pages, prompt, pageLabels, Map.of());
    }
}
