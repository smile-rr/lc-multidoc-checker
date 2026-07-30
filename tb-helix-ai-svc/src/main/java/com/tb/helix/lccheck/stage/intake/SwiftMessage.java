package com.tb.helix.lccheck.stage.intake;

import java.util.List;
import java.util.Map;

/**
 * A SWIFT message, structurally.
 *
 * <p>Only the mechanical part: which type it is, where block 4 begins, which line belongs to
 * which tag. What any of it <em>means</em> is a separate question, answered by
 * {@link CreditReader}.
 *
 * <p>The split matters. Line structure has to be exact and stable — a fact points at
 * {@code tag-31D} and the viewer highlights that line, so a re-read that renumbered would
 * move every highlight. Interpretation is judgement, and judgement is the thing a model is
 * better at than a regular expression.
 *
 * @param lines each with a stable {@code id} of {@code tag-<TAG>} for provenance
 * @param tags  raw tag text, unparsed, in order of first appearance
 */
public record SwiftMessage(
        SwiftMessageType type,
        String raw,
        String block4,
        Map<String, String> tags,
        List<Map<String, Object>> lines) {

    public String tag(String name) {
        return tags.get(name);
    }
}
