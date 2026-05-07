package com.lc.v2.checker.infra.llm;

/**
 * Cleans up text-LLM responses before they reach business code.
 *
 * <p>OpenAI-compatible providers we use (Qwen Bailian, MiniMax) do not all
 * honour {@code enable_thinking:false} the same way: MiniMax-M2 in particular
 * leaks {@code <think>…</think>} reasoning blocks before the JSON, and
 * sometimes wraps the JSON in a {@code ```json … ```} fence sandwiched between
 * prose. Strict JSON parsers see {@code '<'} or {@code '`'} at column 1 and
 * abort.
 *
 * <p>This sanitizer applies to text-LLM responses only. Vision extraction
 * uses a separate {@code RestClient} pipeline and is intentionally not
 * routed through here.
 */
public final class LlmResponseSanitizer {

    private LlmResponseSanitizer() {}

    /**
     * Strip reasoning preamble and unwrap any JSON object/array carried in the
     * response. Pass-through (trim only) when the input already looks like
     * structured JSON or contains no JSON at all — caller can still parse the
     * trimmed text and surface a meaningful error.
     */
    public static String sanitize(String response) {
        if (response == null) return null;
        String s = response;

        // 1. Strip <think>…</think> blocks (any count, anywhere).
        s = s.replaceAll("(?is)<think>.*?</think>", "").trim();

        // 2. If a leading <think> opened but never closed (truncated stream),
        //    drop everything up to and including the open tag.
        int unclosed = indexOfIgnoreCase(s, "<think>");
        if (unclosed >= 0 && indexOfIgnoreCase(s, "</think>") < 0) {
            s = s.substring(unclosed + "<think>".length()).trim();
        }

        // 3. Prefer ```json fenced block contents when present.
        java.util.regex.Matcher fence = java.util.regex.Pattern
                .compile("(?is)```(?:json)?\\s*\\n?(.*?)\\n?```").matcher(s);
        if (fence.find()) {
            String inner = fence.group(1).trim();
            if (startsLikeJson(inner)) return inner;
        }

        // 4. Already looks like JSON → return as-is.
        if (startsLikeJson(s)) return s;

        // 5. Carve out the first balanced {...} object, respecting string
        //    literals so {"a":"}"} is handled correctly.
        String carved = carveFirstObject(s);
        return carved != null ? carved : s;
    }

    private static boolean startsLikeJson(String s) {
        if (s.isEmpty()) return false;
        char c = s.charAt(0);
        return c == '{' || c == '[';
    }

    private static String carveFirstObject(String s) {
        int start = s.indexOf('{');
        if (start < 0) return null;
        int depth = 0;
        boolean inStr = false;
        boolean esc = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inStr) {
                if (esc) esc = false;
                else if (c == '\\') esc = true;
                else if (c == '"') inStr = false;
            } else {
                if (c == '"') inStr = true;
                else if (c == '{') depth++;
                else if (c == '}') {
                    depth--;
                    if (depth == 0) return s.substring(start, i + 1);
                }
            }
        }
        return null;
    }

    private static int indexOfIgnoreCase(String hay, String needle) {
        return hay.toLowerCase().indexOf(needle.toLowerCase());
    }
}
