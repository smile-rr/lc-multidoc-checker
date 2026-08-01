package com.tb.helix.infra.cache;

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

    /**
     * A SWIFT message to its terms.
     *
     * <p>Keyed on the message digest and its type, so the same credit is read once ever and
     * an amendment is a separate entry from the credit it amends.
     */
    public static final String EXTRACT_CREDIT = "extract.credit";
    public static final int    EXTRACT_CREDIT_V = 1;

    /** Bundle pages to document types and page ranges. */
    public static final String SEGMENT_BUNDLE = "segment.bundle";
    /** Batched segment + absolute page numbers + boundary continuation context. */
    public static final int    SEGMENT_BUNDLE_V = 2;

    /** One document's pages to extracted fields. The most expensive op in the system. */
    public static final String EXTRACT_DOC = "extract.doc";
    public static final int    EXTRACT_DOC_V = 1;

    /**
     * One document's pages to layout-preserving markdown.
     *
     * <p>Separate from {@link #EXTRACT_DOC}: different prompt, different product. The
     * markdown is the fallback reading when structured fields are thin or wrong, and must
     * not share a cache entry with the field map — a hit on one must not look like a hit
     * on the other.
     */
    public static final String EXTRACT_DOC_MD = "extract.doc.md";
    public static final int    EXTRACT_DOC_MD_V = 1;

    /**
     * One document's pages to what is on them that is not text.
     *
     * <p>Signatures, seals, stamps, initialled corrections, ticked boxes. A third product
     * from the same pages and the same render spec — so the PNG render is shared and, with
     * images leading the request, the image tokens ride the prefix the field pass paid for.
     *
     * <p>Its own op for the reason the others have their own: the rubric here is UCP 600
     * art. 3, 17, 20, 27 and ISBP §A, and it will be tuned. Tuning it must not invalidate
     * {@link #EXTRACT_DOC}, which is the most expensive op in the system.
     *
     * <p>It is also the dedupe for the lazy pass. A document attested during the reading and
     * then demanded again by a requirement card read out of {@code :47A:} produces the same
     * key, so the second look is a hit rather than a second bill.
     */
    public static final String ATTEST_DOC = "attest.doc";
    public static final int    ATTEST_DOC_V = 1;

    /** The credit's 46A/47A to requirement cards. */
    public static final String PLAN_REQUIREMENTS = "plan.requirements";
    /** Requirements may now carry a compiled condition tree, not only prose. */
    public static final int    PLAN_REQUIREMENTS_V = 2;

    /**
     * The whole plan, weighed: gate verdicts, candidate rules and the credit's own terms to
     * a decision about what should run.
     *
     * <p>Its own op rather than a second version of {@link #PLAN_REQUIREMENTS}, because the
     * two answer different questions and are tuned separately — and because this one runs
     * with the model's reasoning turned on, so an entry of one shape must never be served
     * for the other.
     */
    public static final String PLAN_GOVERN = "plan.govern";
    public static final int    PLAN_GOVERN_V = 1;

    /**
     * One judged rule against one set of facts.
     *
     * <p>Keyed on a digest of the facts the rule reads rather than the whole case, so a
     * correction to an unrelated field does not invalidate every conclusion.
     */
    public static final String JUDGE_RULE = "judge.rule";
    public static final int    JUDGE_RULE_V = 1;
}
