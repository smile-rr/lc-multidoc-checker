package com.lc.gov.library;

import com.lc.gov.library.PdfTextExtractor.ExtractedPdf;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Splits extracted rulebook text into citable articles.
 *
 * <p>No single pattern generalises — UCP numbers articles, ISBP uses letter-digit
 * paragraph ids, an internal handbook uses whatever its Word template did. So
 * several patterns are tried and the one that finds the most structure wins,
 * with a blank-line fallback when none does.
 *
 * <p>The output is deliberately a <em>proposal</em>. The import is two-step, and
 * the author reviews and unticks before anything becomes a citable article — the
 * splitter is allowed to be wrong as long as it is legibly wrong.
 */
@Component
public class ArticleSplitter {

    /** A proposed article, not yet persisted. */
    public record Candidate(
            int index,
            String label,
            String heading,
            String body,
            int charCount,
            int page) {}

    public record SplitResult(String strategy, List<Candidate> candidates) {}

    /** Tried in order; whichever yields the most matches wins, so a document that
     *  happens to contain the word "Article" once does not beat real structure. */
    private static final List<Strategy> STRATEGIES = List.of(
            new Strategy("article",
                    Pattern.compile("(?m)^[ \\t]*Article[ \\t]+(\\d+[A-Za-z]?)\\b[ \\t.:-]*(.*)$")),
            new Strategy("clause",
                    Pattern.compile("(?m)^[ \\t]*(?:Clause|Section|Rule)[ \\t]+(\\d+(?:\\.\\d+)*[A-Za-z]?)\\b[ \\t.:-]*(.*)$")),
            new Strategy("paragraph-id",
                    Pattern.compile("(?m)^[ \\t]*([A-Z]\\d{1,3})[).]?[ \\t]+(\\S.*)$")),
            new Strategy("dotted-number",
                    Pattern.compile("(?m)^[ \\t]*(\\d+(?:\\.\\d+)+)[ \\t.)-]*(\\S.*)$")),
            new Strategy("numbered",
                    Pattern.compile("(?m)^[ \\t]*(\\d{1,3})[.)][ \\t]+(\\S.*)$")));

    private record Strategy(String name, Pattern pattern) {}

    /** Below this, a "structure" is more likely a coincidence than a rulebook. */
    private static final int MIN_MATCHES = 3;

    public SplitResult split(ExtractedPdf pdf) {
        String text = pdf.fullText();

        Strategy best = null;
        List<int[]> bestMatches = List.of();
        List<String[]> bestLabels = List.of();

        for (Strategy strategy : STRATEGIES) {
            List<int[]> spans = new ArrayList<>();
            List<String[]> labels = new ArrayList<>();
            Matcher m = strategy.pattern().matcher(text);
            while (m.find()) {
                spans.add(new int[] {m.start(), m.end()});
                labels.add(new String[] {m.group(1), m.groupCount() >= 2 ? m.group(2) : ""});
            }
            if (spans.size() >= MIN_MATCHES && spans.size() > bestMatches.size()) {
                best = strategy;
                bestMatches = spans;
                bestLabels = labels;
            }
        }

        if (best == null) return new SplitResult("blocks", splitOnBlankLines(pdf, text));

        List<Candidate> out = new ArrayList<>(bestMatches.size());
        for (int i = 0; i < bestMatches.size(); i++) {
            int headStart = bestMatches.get(i)[0];
            int bodyStart = bestMatches.get(i)[1];
            int end = (i + 1 < bestMatches.size()) ? bestMatches.get(i + 1)[0] : text.length();

            String heading = bestLabels.get(i)[1].strip();
            String body = text.substring(bodyStart, Math.max(bodyStart, end)).strip();
            if (heading.isEmpty() && !body.isEmpty()) {
                // The heading ran onto the next line — take it from the body.
                int nl = body.indexOf('\n');
                heading = (nl < 0 ? body : body.substring(0, nl)).strip();
            }

            out.add(new Candidate(
                    i,
                    bestLabels.get(i)[0].strip(),
                    truncate(heading, 120),
                    body,
                    body.length(),
                    pdf.pageAt(headStart)));
        }
        return new SplitResult(best.name(), out);
    }

    /** Last resort: paragraphs separated by blank lines, keeping only blocks
     *  substantial enough to be worth citing. */
    private List<Candidate> splitOnBlankLines(ExtractedPdf pdf, String text) {
        List<Candidate> out = new ArrayList<>();
        Matcher m = Pattern.compile("\\n\\s*\\n").matcher(text);
        int start = 0, index = 0;
        List<int[]> blocks = new ArrayList<>();
        while (m.find()) {
            blocks.add(new int[] {start, m.start()});
            start = m.end();
        }
        blocks.add(new int[] {start, text.length()});

        for (int[] span : blocks) {
            String body = text.substring(span[0], span[1]).strip();
            if (body.length() < 80) continue;
            int nl = body.indexOf('\n');
            String heading = (nl < 0 ? body : body.substring(0, nl)).strip();
            out.add(new Candidate(
                    index,
                    String.valueOf(index + 1),
                    truncate(heading, 120),
                    body,
                    body.length(),
                    pdf.pageAt(span[0])));
            index++;
        }
        return out;
    }

    /**
     * Article ids are citation keys — {@code check_def.clause_refs} holds them —
     * so they are derived from the parsed label, never from position. A re-import
     * that finds the same labels produces the same ids, and checks keep resolving.
     */
    public static String articleId(String bookId, String label) {
        String slug = label == null ? "" : label.trim().toUpperCase()
                .replaceAll("[^A-Z0-9]+", "-")
                .replaceAll("^-|-$", "");
        return bookId + "-" + (slug.isEmpty() ? "X" : slug);
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        String v = value.strip();
        return v.length() <= max ? v : v.substring(0, max - 1) + "…";
    }
}
