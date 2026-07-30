package com.tb.helix.harness.doc;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * {@code helix.render.*}
 *
 * <p><b>DPI is not the cost lever. Pixel count is.</b>
 *
 * <p>Vision models tile an image and charge per tile, so tokens scale with area. Rendering
 * at 300 dpi and downscaling to a 1600 px cap costs exactly what rendering at 150 dpi and
 * not downscaling costs — and looks considerably better, because the downscale antialiases
 * where the low-dpi render simply loses the stroke. So {@code dpi} is a quality knob and
 * {@link Profile#maxLongEdgePx} is the money knob.
 *
 * <p>Roughly, per A4 page, for the Qwen-VL family (≈ one token per 56×56 px):
 *
 * <table border="1">
 *   <caption>Cost by cap</caption>
 *   <tr><th>long edge</th><th>≈ tokens/page</th><th>100 pages</th><th>reads small print?</th></tr>
 *   <tr><td>800</td>  <td>~90</td>  <td>~9k</td>  <td>no — shapes and layout only</td></tr>
 *   <tr><td>1280</td> <td>~370</td> <td>~37k</td> <td>mostly</td></tr>
 *   <tr><td>1600</td> <td>~580</td> <td>~58k</td> <td>yes</td></tr>
 *   <tr><td>2048</td> <td>~945</td> <td>~95k</td> <td>yes, comfortably</td></tr>
 * </table>
 *
 * <p>Which is why profiles are per role rather than global. Segmentation only answers
 * "what kind of document is this page?" and does it fine at 800 px; extraction has to read
 * a unit price and needs 1600. Running a 100-page bundle through segmentation at extraction
 * resolution costs about ten times what it needs to, and that is the single largest avoidable
 * cost in the system.
 */
@ConfigurationProperties(prefix = "helix.render")
public record RenderProperties(
        int dpi,
        boolean persistPages,
        int maxBundlePages,
        Map<String, Profile> profiles) {

    /**
     * @param maxLongEdgePx the cap that decides the bill
     * @param maxPages      per-request page ceiling, so one mis-segmented document cannot
     *                      become one enormous call
     */
    public record Profile(Integer dpi, int maxLongEdgePx, int maxPages) {
    }

    public RenderProperties {
        dpi = dpi <= 0 ? 300 : dpi;
        // A refusal, not a truncation — see PageBudget.
        maxBundlePages = maxBundlePages <= 0 ? 300 : maxBundlePages;
        profiles = profiles == null ? Map.of() : Map.copyOf(profiles);
    }

    private static final Profile FALLBACK = new Profile(null, 1600, 12);

    /**
     * The render spec for a role.
     *
     * <p>A profile may override dpi, but usually should not: quality is cheap and area is
     * not. Falls back to a mid setting rather than the cheapest, because a silently
     * illegible render produces a confidently wrong extraction, which is worse than a
     * slightly expensive one.
     */
    public RenderSpec specFor(String role) {
        Profile p = profiles.getOrDefault(role.toLowerCase(), FALLBACK);
        return new RenderSpec(p.dpi() == null ? dpi : p.dpi(), p.maxPages(), p.maxLongEdgePx());
    }
}
