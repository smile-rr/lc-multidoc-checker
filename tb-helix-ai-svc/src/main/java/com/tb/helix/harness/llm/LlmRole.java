package com.tb.helix.harness.llm;

/**
 * What a model is being asked to do.
 *
 * <p>Domain code names a <em>role</em>, never a slot and never a provider. "Extract the
 * fields from these pages" is a statement about the work; "send this to qwen3.7-vl-flash
 * at dashscope" is a statement about a deployment, and stages have no business making it.
 *
 * <p>Configuration maps roles to slots:
 *
 * <pre>
 *   helix.roles:
 *     extract: [vlm-1, vlm-2]     # two slots — they run in parallel and vote
 *     judge:   [llm-1]
 * </pre>
 *
 * <p>So changing provider, model or consensus width is a configuration edit. No stage,
 * rule or controller mentions any of them, and the ArchUnit boundary makes that
 * structural rather than aspirational.
 */
public enum LlmRole {

    /** Identify which document each page of a bundle belongs to. Vision. */
    SEGMENT,

    /** Read fields off a document's pages. Vision, and the dominant cost of a run. */
    EXTRACT,

    /**
     * Read structured text into fields — a SWIFT message, a covering schedule.
     *
     * <p>Distinct from {@link #EXTRACT}, which reads images: the same job one layer down,
     * and rendering text to a picture to read it back would be absurd.
     */
    READ_TEXT,

    /**
     * Transcribe page images into plain text — a scanned letter of credit.
     *
     * <p>Vision, but not extraction: the answer is a dump the SWIFT reader can cut, not a
     * field map. Mapped to a VLM slot; the text {@link #READ_TEXT} call that follows is
     * what turns the dump into terms.
     */
    TRANSCRIBE,

    /** Read this credit's 46A/47A into requirement cards. Text. */
    PLAN,

    /** Decide whether a judged rule is satisfied. Text, sometimes with tools. */
    JUDGE,

    /** Draft officer-facing prose — a discrepancy statement, an answer to a question. */
    NARRATE
}
