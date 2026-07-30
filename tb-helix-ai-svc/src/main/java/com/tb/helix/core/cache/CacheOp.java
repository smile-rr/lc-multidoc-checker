package com.tb.helix.core.cache;

/**
 * The operations worth caching, and the version of each.
 *
 * <p>Constants rather than an enum so the op name stays a plain string in the database
 * — readable in a SQL console, and addable by a module without editing a shared enum.
 *
 * <p>Each op has its own version. Change how the extraction prompt is assembled and bump
 * {@link #EXTRACT_DOC_V} alone; a single global version makes every unrelated op
 * recompute at once, which is how a cache gets a reputation for never helping.
 *
 * <p>What is <em>not</em> here is as deliberate as what is. Cheap deterministic work —
 * splitting a page range out of a PDF, normalising a date — is not cached: the lookup
 * costs more than the work, and a cache entry that is never worth its row is a liability.
 */
public final class CacheOp {

    private CacheOp() {
    }

    /** TIFF to PDF. Deterministic and model-free, so it never expires. */
    public static final String CONVERT_TIFF_PDF = "convert.tiff_pdf";
    public static final int    CONVERT_TIFF_PDF_V = 1;

    /**
     * PDF pages to PNG at a given DPI.
     *
     * <p>Cached so that several vision slots examining the same pages in one run share
     * a single render — which was the real waste, not the render itself.
     */
    public static final String RENDER_PAGES = "render.pages";
    public static final int    RENDER_PAGES_V = 1;

    /** MT700 text to structured credit terms. Pure parsing; never expires. */
    public static final String PARSE_MT700 = "parse.mt700";
    public static final int    PARSE_MT700_V = 1;

    /** Bundle pages to document types and page ranges. */
    public static final String SEGMENT_BUNDLE = "segment.bundle";
    public static final int    SEGMENT_BUNDLE_V = 1;

    /** One document's pages to extracted fields. The most expensive op in the system. */
    public static final String EXTRACT_DOC = "extract.doc";
    public static final int    EXTRACT_DOC_V = 1;

    /** The credit's 46A/47A to requirement cards. */
    public static final String PLAN_REQUIREMENTS = "plan.requirements";
    public static final int    PLAN_REQUIREMENTS_V = 1;

    /**
     * One judged rule against one set of facts.
     *
     * <p>Keyed on a digest of the facts the rule reads rather than the whole case, so a
     * correction to an unrelated field does not invalidate every conclusion.
     */
    public static final String JUDGE_RULE = "judge.rule";
    public static final int    JUDGE_RULE_V = 1;
}
