package com.tb.helix.harness.model;

/**
 * Cleaning up after a model.
 *
 * <p>Models told to return JSON return JSON wrapped in a code fence, or preceded by "Here
 * is the JSON:", or with a reasoning block in front of it. Every caller would otherwise
 * write its own tolerant parse, and they would disagree about what counts as tolerant.
 *
 * <p>Deliberately conservative: it removes wrappers whose only purpose is presentation and
 * never reaches inside the content. A cleaner that tries to repair malformed JSON turns a
 * loud failure into a quiet wrong answer, and in an examination that is the worse outcome.
 */
final class LlmText {

    private LlmText() {
    }

    static String clean(String content) {
        if (content == null) return null;
        String s = content.strip();

        // Reasoning that leaked past enable_thinking:false. Drop the block, keep the rest.
        int thinkEnd = s.lastIndexOf("</think>");
        if (thinkEnd >= 0) s = s.substring(thinkEnd + "</think>".length()).strip();

        // ```json … ``` — the most common wrapper by a wide margin.
        if (s.startsWith("```")) {
            int firstNewline = s.indexOf('\n');
            int lastFence = s.lastIndexOf("```");
            if (firstNewline > 0 && lastFence > firstNewline) {
                s = s.substring(firstNewline + 1, lastFence).strip();
            }
        }
        return s;
    }

    /**
     * The first balanced JSON object or array in a string.
     *
     * <p>For the case where a model prefixes prose despite instructions. Returns null when
     * there is nothing balanced to find — the caller then fails, which is correct: a
     * response that is not the shape we asked for is not a response.
     */
    static String extractJson(String content) {
        if (content == null) return null;
        String s = clean(content);
        int start = -1;
        char open = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '{' || c == '[') { start = i; open = c; break; }
        }
        if (start < 0) return null;

        char close = open == '{' ? '}' : ']';
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == open) depth++;
            else if (c == close && --depth == 0) return s.substring(start, i + 1);
        }
        return null;
    }
}
