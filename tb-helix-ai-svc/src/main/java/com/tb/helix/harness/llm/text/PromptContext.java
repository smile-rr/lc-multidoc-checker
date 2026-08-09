package com.tb.helix.harness.llm.text;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Assembling a long prompt so the parts that never change lead it.
 *
 * <p>A prompt built for one case is mostly not about that case. Vocabularies, operator
 * tables, article texts and output contracts are byte-identical across every credit this
 * bank will ever examine; only the credit's own text and the candidate list differ. Written
 * in the order a person would write them — "here is this credit, now here are the rules" —
 * every case pays full price for the invariant nine tenths, because a provider's prefix
 * cache matches on a <em>leading</em> byte run and the first volatile character ends it.
 *
 * <p>So blocks declare themselves {@link Stability#STABLE}, {@link Stability#SHARED} or
 * {@link Stability#VOLATILE} and this renders them in that order, whatever order they were
 * added in. It is the text-side mirror of what the vision path already does by putting images
 * ahead of the instruction, and for the same reason.
 *
 * <p>{@link Stability#SHARED} is the middle rung and it exists because a stage may issue
 * several calls about <em>one</em> case. Everything those calls have in common is a prefix in
 * its own right: the first call warms it and the rest ride it, which is why a stage that fans
 * out sends its first call alone. That only holds while the common material leads — a
 * per-call block placed above it gives every call a different prefix from the first divergence
 * onward, and the warming becomes latency spent for nothing. Ordering the three tiers here
 * makes that a property of the type rather than of whoever adds the next block.
 *
 * <p>The second use is the derivation cache. {@link #volatileDigest()} hashes everything that
 * is not invariant — shared and volatile both, because material shared across one case's calls
 * is exactly what distinguishes that case from the next one. So an entry is keyed on what
 * actually makes this call different, and re-wording a vocabulary block does not invalidate
 * every stored answer. Where a prompt edit <em>should</em> invalidate them, key on
 * {@link #digest()} instead.
 *
 * <p>Deliberately domain-neutral: it knows about ordering and hashing and nothing about
 * credits, documents or rules. What goes in a block is the caller's business.
 */
public final class PromptContext {

    /**
     * How widely a block's text is the same.
     *
     * <p>{@code STABLE} — the same on every call this bank will ever make: a vocabulary, a
     * rubric, an output contract. {@code SHARED} — the same on every call about this case, and
     * different for the next case. {@code VOLATILE} — the reason this call is not the one
     * beside it. Declared in that order, and rendered in it.
     */
    public enum Stability { STABLE, SHARED, VOLATILE }

    /**
     * One labelled section of a prompt.
     *
     * @param title rendered as a heading, so a model — and a person reading the trace — can
     *              tell where one section ends and the next begins
     */
    public record Block(String title, String text, Stability stability) {
    }

    private final List<Block> blocks = new ArrayList<>();

    public static PromptContext create() {
        return new PromptContext();
    }

    /** A section that is the same on every call: a vocabulary, a rubric, an output contract. */
    public PromptContext stable(String title, String text) {
        return add(title, text, Stability.STABLE);
    }

    /**
     * A section every call about this case carries: the presentation the whole stage reads
     * from. Rendered after {@link #stable} and before {@link #varying}, so a stage that fans
     * out has one prefix its first call warms and the rest ride.
     */
    public PromptContext shared(String title, String text) {
        return add(title, text, Stability.SHARED);
    }

    /** A section that is why this call is not the one beside it. */
    public PromptContext varying(String title, String text) {
        return add(title, text, Stability.VOLATILE);
    }

    private PromptContext add(String title, String text, Stability stability) {
        // An empty section is dropped rather than rendered as a heading with nothing under
        // it. A model handed "THE CREDIT'S ADDITIONAL CONDITIONS" followed by blank tends to
        // invent some.
        if (text == null || text.isBlank()) return this;
        blocks.add(new Block(title, text.strip(), stability));
        return this;
    }

    public List<Block> blocks() {
        return List.copyOf(blocks);
    }

    /** The whole prompt: stable, then shared, then volatile; within a tier, the order added. */
    public String render() {
        return render(Stability.STABLE) + render(Stability.SHARED) + render(Stability.VOLATILE);
    }

    private String render(Stability which) {
        StringBuilder sb = new StringBuilder();
        for (Block b : blocks) {
            if (b.stability() != which) continue;
            sb.append(b.title()).append('\n').append(b.text()).append("\n\n");
        }
        return sb.toString();
    }

    /** Everything, hashed. Use where a change to any wording should mean a fresh answer. */
    public String digest() {
        return sha256Hex(render());
    }

    /**
     * Everything that is not invariant, hashed — shared and volatile both. Use as a cache key
     * where the invariant half is not worth re-keying. Shared material belongs in here: it is
     * what one case's calls have in common and what the next case's do not.
     */
    public String volatileDigest() {
        return sha256Hex(render(Stability.SHARED) + render(Stability.VOLATILE));
    }

    private static String sha256Hex(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
