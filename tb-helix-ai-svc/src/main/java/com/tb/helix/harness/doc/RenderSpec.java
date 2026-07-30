package com.tb.helix.harness.doc;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * How to rasterise a page.
 *
 * <p>Every field here is part of the render's cache key, which means every field must
 * actually be applied. The predecessor hashed a long-edge cap into its key and never
 * enforced it, so the key described a request that was never made — and two slots
 * configured at different resolutions quietly shared one render at a third.
 *
 * @param dpi           rasterisation density. 200 reads small print on a scan without
 *                      producing images a model has to downscale anyway.
 * @param maxPages      ceiling on pages per request, so a mis-segmented 400-page bundle
 *                      cannot become one enormous call
 * @param maxLongEdgePx downscale so the longer edge does not exceed this. Providers
 *                      resize server-side regardless; doing it here means the bytes on
 *                      the wire match what the model sees, and the cost is predictable.
 */
public record RenderSpec(int dpi, int maxPages, Integer maxLongEdgePx) {

    public RenderSpec {
        if (dpi < 50 || dpi > 600) {
            throw new IllegalArgumentException("dpi out of sensible range (50-600): " + dpi);
        }
        if (maxPages < 1) {
            throw new IllegalArgumentException("maxPages must be at least 1, got: " + maxPages);
        }
    }

    /** The subset of the cache key this contributes. */
    public Map<String, Object> asCacheParams() {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("dpi", dpi);
        params.put("maxPages", maxPages);
        params.put("maxLongEdgePx", maxLongEdgePx == null ? "" : maxLongEdgePx);
        return params;
    }
}
