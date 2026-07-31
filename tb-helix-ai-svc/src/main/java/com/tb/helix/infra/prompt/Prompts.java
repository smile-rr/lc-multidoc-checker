package com.tb.helix.infra.prompt;

import java.util.Map;

/**
 * The text we send to models.
 *
 * <p>Prompts were Java string constants — ninety lines of them in one class, forty in
 * another. Nothing about that is fatal and everything about it is friction: the person best
 * placed to improve the wording of an examiner's instruction is an examiner, and the wording
 * sat behind a rebuild, a code review and a deploy.
 *
 * <p><b>An interface with one implementation, which is usually waste.</b> It earns its file
 * here for the reason the general rule allows: a second implementation is the point. Prompts
 * follow the same road the document vocabulary and the field dictionary already took — out
 * of the code, into a file, and then into the console where the people who own the wording
 * can edit it. When that happens it is a bean swap, and no stage changes.
 *
 * <p>Domain-neutral by construction: this knows how to find text and substitute
 * {@code {tokens}}, and nothing about credits, documents or examinations.
 */
public interface Prompts {

    /**
     * The prompt by name.
     *
     * @throws IllegalStateException when it is missing. A prompt that silently resolves to
     *                               nothing produces a model call with no instruction and an
     *                               answer that looks like a bad model rather than a bad
     *                               deployment.
     */
    String get(String name);

    /**
     * The prompt with its {@code {tokens}} filled in.
     *
     * <p>Named tokens rather than positional {@code %s}: a prompt is edited by people who did
     * not write the call site, and counting placeholders across ninety lines to work out
     * which one is the bundle's page count is how the wrong value ends up in the wrong slot.
     */
    String fill(String name, Map<String, Object> values);
}
