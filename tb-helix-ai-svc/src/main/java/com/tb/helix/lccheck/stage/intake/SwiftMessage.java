package com.tb.helix.lccheck.stage.intake;

import java.util.List;
import java.util.Map;

/**
 * One SWIFT message, structurally.
 *
 * <p>Only the mechanical part: where it sits in the file, which type it claims to be, where
 * block 4 begins, which line belongs to which tag. What any of it <em>means</em> is a
 * separate question, answered by {@link CreditReader} over the whole file at once — because
 * meaning is what an amendment changes, and a message read alone cannot know it was amended.
 *
 * @param seq   1-based position in the file. The order is the history: message 3 was sent
 *              after message 2, and that is what decides which value stands.
 * @param lines each with a stable {@code id} for provenance — {@code tag-31D} in the first
 *              message, {@code m2-tag-31D} in the second (see {@link SwiftReader})
 * @param tags  raw tag text, unparsed, in order of first appearance
 */
public record SwiftMessage(
        int seq,
        SwiftMessageType type,
        String raw,
        String block4,
        Map<String, String> tags,
        List<Map<String, Object>> lines) {

    public String tag(String name) {
        return tags.get(name);
    }

    /** How this message is named in a prompt and in the tape: {@code #2 MT707}. */
    public String designation() {
        return "#" + seq + " MT" + type.code();
    }
}
