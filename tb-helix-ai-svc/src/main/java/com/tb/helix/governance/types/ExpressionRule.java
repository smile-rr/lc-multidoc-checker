package com.tb.helix.governance.types;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A check written as one decision table, in one box of text.
 *
 * <h2>Why a check needs more than one answer</h2>
 *
 * <p>A presentation is not always compliant or discrepant. Take expiry. A credit available
 * with <b>any bank</b> is presented at a nominated bank's counter, and that counter's date is
 * the one that governs — past the expiry date is late, and that is settled. A credit
 * <b>restricted to a named bank</b> is a different question: the date we hold is the one on
 * the covering schedule, and the date that governs is at a counter days away, on a stamp we
 * may not have read. The honest answer there is not "discrepant" — it is <em>a person has to
 * look at this</em>.
 *
 * <p>Written as two checks that is two findings for one fault, and an officer clearing one is
 * left with the other still open on the same date. Written as one flat condition it forces a
 * choice between overstating and understating. So it is one table with one answer.
 *
 * <h2>Two levels: three keywords here, SpEL underneath</h2>
 *
 * <pre>
 *   WHEN #matches({LC.available_with}, 'ANY\\s*BANK')
 *        and {CS.presentation_date} &lt;= {LC.expiry_date}                THEN "clean"
 *   WHEN #notMatches({LC.available_with}, 'ANY\\s*BANK')
 *        and {CS.presentation_date} &lt;= #datePlus({LC.expiry_date}, 5)  THEN "doubt"
 *   ELSE "discrepancy"
 * </pre>
 *
 * <p>The order of the branches decides; the order <em>within</em> a condition does not. The
 * fold is symmetric, so {@code unknown and false} is false exactly as {@code false and
 * unknown} is — a branch with one definitely-false operand does not match however it was
 * typed, and the table moves on.
 *
 * <p><b>{@code WHEN}, {@code THEN}, {@code ELSE} and nothing else.</b> This class is the
 * whole of the second level: it cuts the branches, and everything between a WHEN and its
 * THEN goes to the expression engine untouched. SpEL evaluates one condition at a time and
 * never sees the table. The output is always a quoted string, and always one of the
 * examination's own three words — a check may not invent a fourth outcome any more than an
 * officer may.
 *
 * <p><b>First match wins, and the table stops there.</b> Branches below the one that matched
 * are not evaluated at all.
 *
 * <p>SpEL could not do this itself. Its two conditionals — {@code a ? b : c} and
 * {@code a ?: b} — are both refused by the grammar, because either can turn "nothing was
 * read" into a confident answer. Splitting above it is what keeps that refusal intact.
 *
 * <p>Double quotes for the output, single quotes inside a condition. That is not decoration:
 * it is what lets {@code THEN} be found without parsing SpEL, because an output string can
 * never be confused with a literal in the condition beside it.
 *
 * <h2>An unanswerable branch stops the table</h2>
 *
 * <p>A branch that cannot be settled stops the table at DOUBT. We do not know that it failed
 * to match, so we cannot know the next branch is reached, and answering from a row the table
 * may never have got to is worse than saying we could not settle it.
 *
 * <p>Worth stating because the obvious thing to do is the wrong one, and a familiar language
 * does it: a decision table that treats unknown as "did not match" falls through, so a date
 * nobody read reaches {@code ELSE "discrepancy"} — a refusal built on nothing, and
 * indistinguishable from a real one. Verified against Postgres, which answers exactly that.
 *
 * @param source    what the author typed, kept verbatim so a round trip through the console
 *                  never reformats somebody's rule
 * @param branches  in order; the first whose condition is true decides
 * @param otherwise what the table answers when no branch matched
 */
public record ExpressionRule(String source, String scope, List<Branch> branches, Verdict otherwise) {

    /** One {@code WHEN … THEN …}. */
    public record Branch(String when, Verdict then) {
    }

    /** What one condition came to. The engine's three values, named from here so this type
     *  does not depend on the engine — the console asks the same question of typed-in values
     *  that a run asks of facts. */
    public enum Answer { TRUE, FALSE, UNKNOWN }

    /** What a check answers, and the only three words it may. */
    public enum Verdict {
        CLEAN, DOUBT, DISCREPANT;

        /** The word as it is written in a table. */
        public String word() {
            return this == DISCREPANT ? "discrepancy" : name().toLowerCase(Locale.ROOT);
        }

        static Verdict of(String word) {
            return switch (word == null ? "" : word.trim().toUpperCase(Locale.ROOT)) {
                case "CLEAN" -> CLEAN;
                case "DOUBT" -> DOUBT;
                case "DISCREPANCY", "DISCREPANT" -> DISCREPANT;
                default -> null;
            };
        }
    }

    /** The table's own syntax, for the console's help and the planner's prompt. */
    public static final String SYNTAX = """
            A check is a table. The first WHEN whose condition is true decides it.

              WHEN <condition>   THEN "clean"
              WHEN <condition>   THEN "doubt"
              ELSE "discrepancy"

            WHEN, THEN and ELSE are the only keywords. Everything between a WHEN and its
            THEN is a condition in the language below. An output is always a quoted string
            and always one of "clean", "doubt" or "discrepancy" — there is no fourth answer.

            ELSE is required. A table with no fallback answers nothing on the presentation
            nobody thought about, and that presentation is why a fallback exists.

            A condition that cannot be answered STOPS the table at "doubt". It does not fall
            through to the next WHEN: we do not know that it failed to match, so we cannot
            know the next line is reached.
            """;

    // =========================================================================
    // Reading it
    // =========================================================================

    // The output is double-quoted and a SpEL literal is single-quoted, so THEN can be found
    // without parsing the condition beside it. Both accepted on the way in, one written out.
    private static final String QUOTED = "\"([^\"]*)\"|'([^']*)'";
    private static final Pattern WHEN_THEN = Pattern.compile(
            "\\bWHEN\\b(.*?)\\bTHEN\\b\\s*(?:" + QUOTED + ")",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern ELSE = Pattern.compile(
            "\\bELSE\\b\\s*(?:" + QUOTED + ")", Pattern.CASE_INSENSITIVE);

    /**
     * Reads the stored shape, or answers null when this rule is a tree.
     *
     * <p>Three forms are read and one is written. {@code source} is the table as typed;
     * {@code clauses} and a bare {@code when} are what earlier rules were stored as, still
     * read so nothing already authored has to be migrated by hand.
     */
    @SuppressWarnings("unchecked")
    public static ExpressionRule of(Map<String, Object> rule) {
        if (rule == null) return null;
        String scope = text(rule.get("scope"));

        String source = text(rule.get("source"));
        if (source != null) return parse(source, scope);

        // --- what earlier rules were stored as ------------------------------
        Object graded = rule.get("clauses");
        if (graded instanceof List<?> list && !list.isEmpty()) {
            List<Branch> out = new ArrayList<>();
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Map<String, Object> c = (Map<String, Object>) m;
                String when = text(c.get("when"));
                if (when == null) continue;
                // A graded clause said what its FAILURE meant, so as a table it is the
                // branch that answers CLEAN and falls through to that grade.
                Verdict v = Verdict.of(String.valueOf(
                        c.get("grade") != null ? c.get("grade") : c.get("outcome")));
                out.add(new Branch(when, Verdict.CLEAN));
                if (out.size() == list.size() && v != null) {
                    return new ExpressionRule(null, scope, List.copyOf(out), v);
                }
            }
            return out.isEmpty() ? null
                    : new ExpressionRule(null, scope, List.copyOf(out), Verdict.DISCREPANT);
        }

        String when = text(rule.get("when"));
        return when == null ? null : new ExpressionRule(null, scope,
                List.of(new Branch(when, Verdict.CLEAN)), Verdict.DISCREPANT);
    }

    /** The table, exactly as written. */
    public static ExpressionRule parse(String source, String scope) {
        if (source == null || source.isBlank()) return null;

        Matcher m = WHEN_THEN.matcher(source);
        List<Branch> branches = new ArrayList<>();
        int end = 0;
        while (m.find()) {
            branches.add(new Branch(m.group(1).trim(), Verdict.of(quoted(m, 2))));
            end = m.end();
        }

        // ELSE is only an ELSE after the last THEN. Searched from there so the letters
        // appearing inside a branch condition cannot be taken for the table's fallback.
        Matcher e = ELSE.matcher(source.substring(Math.min(end, source.length())));
        Verdict otherwise = e.find() ? Verdict.of(quoted(e, 1)) : null;
        return new ExpressionRule(source, scope, List.copyOf(branches), otherwise);
    }

    private static String quoted(Matcher m, int first) {
        return m.group(first) != null ? m.group(first) : m.group(first + 1);
    }

    // =========================================================================
    // What is wrong with it
    // =========================================================================

    /**
     * Structure only — whether a condition is well formed, safe and readable against the
     * dictionary belongs to the compiler, and asking it here would be a second opinion about
     * the same text.
     */
    public List<String> problems() {
        List<String> out = new ArrayList<>();
        if (branches.isEmpty()) {
            out.add("There is no WHEN here. A check is WHEN <condition> THEN \"clean\", "
                    + "and an ELSE for everything else.");
        }
        for (int i = 0; i < branches.size(); i++) {
            Branch b = branches.get(i);
            String at = "WHEN " + (i + 1);
            if (b.when() == null || b.when().isBlank()) {
                out.add("There is nothing to compare in " + at + ".");
            }
            if (b.then() == null) {
                out.add(at + " does not say what it answers. THEN takes \"clean\", \"doubt\" "
                        + "or \"discrepancy\".");
            }
        }
        if (otherwise == null && !branches.isEmpty()) {
            out.add("The table has no ELSE. Say what it answers when no WHEN matches — "
                    + "ELSE \"clean\", ELSE \"doubt\" or ELSE \"discrepancy\".");
        }
        return out;
    }

    /** Every condition in the table, for a caller that compiles them one at a time. */
    public List<String> sources() {
        return branches.stream().map(Branch::when)
                .filter(s -> s != null && !s.isBlank()).toList();
    }

    // =========================================================================
    // The walk
    // =========================================================================

    /**
     * @param ran       how many branches were evaluated. The rest were not, and evidence for
     *                  a comparison nobody made is how a refusal gets overturned.
     * @param matched   the branch that decided, or null when the table fell through to ELSE
     * @param unsettled true when a branch could not be answered and stopped the table. A
     *                  DOUBT of this kind is an absence; a DOUBT the table actually chose is
     *                  the rulebook saying a person must look. Same word, and they must not
     *                  be reported the same way — one is a check working as written, the
     *                  other is an extractor to go and fix.
     */
    public record Decision(Verdict verdict, int ran, Integer matched, boolean unsettled) {
    }

    /**
     * First match wins, and nothing below it runs.
     *
     * <p>The one statement of what a table means. Both the console's simulator and the
     * examination call it — a second implementation would be a second answer, and the one
     * that is wrong is whichever nobody was looking at.
     *
     * @param run evaluates the branch at that index. Called at most once per branch, in
     *            order, and not at all for branches below the one that decided.
     */
    public Decision decide(java.util.function.IntFunction<Answer> run) {
        for (int i = 0; i < branches.size(); i++) {
            Verdict then = branches.get(i).then();
            switch (run.apply(i)) {
                case TRUE -> {
                    return new Decision(then == null ? Verdict.DOUBT : then, i + 1, i, false);
                }
                // NOT "did not match" — see the class note. Falling through here is the
                // obvious thing and the wrong one: a value nobody read would reach ELSE and
                // be reported confidently.
                case UNKNOWN -> {
                    return new Decision(Verdict.DOUBT, i + 1, null, true);
                }
                case FALSE -> { }
            }
        }
        return new Decision(otherwise == null ? Verdict.DOUBT : otherwise,
                branches.size(), null, otherwise == null);
    }

    // =========================================================================
    // Writing it back
    // =========================================================================

    /** The stored shape: the text as typed, and nothing derived from it. */
    public Map<String, Object> toMap() {
        Map<String, Object> rule = new LinkedHashMap<>();
        rule.put("v", 3);
        rule.put("scope", scope);
        rule.put("source", source == null ? print() : source);
        return rule;
    }

    /** A table printed from its parts, for a rule that arrived in an older shape. */
    public String print() {
        StringBuilder sb = new StringBuilder();
        for (Branch b : branches) {
            sb.append("WHEN ").append(b.when()).append("\n  THEN \"")
              .append(b.then() == null ? "doubt" : b.then().word()).append("\"\n");
        }
        return sb.append("ELSE \"")
                 .append(otherwise == null ? "doubt" : otherwise.word())
                 .append('"').toString();
    }

    private static String text(Object o) {
        return o == null || String.valueOf(o).isBlank() ? null : String.valueOf(o);
    }
}
