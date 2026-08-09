package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.types.Operator;

import java.util.List;
import java.util.Optional;

/**
 * What a check came to, and the working behind it.
 *
 * <h2>Why these are not the tree walker's</h2>
 *
 * <p>Every one of these types was nested inside {@link RuleEvaluator}, because that was the
 * only thing producing them. Then a second language arrived, and
 * {@link ExpressionEvaluator} — which shares not one line of the tree walk — named
 * {@code RuleEvaluator.Result} forty-four times, {@link SettleTool} named
 * {@code RuleEvaluator.Fact}, and the whole execute stage read both through the walker's
 * namespace.
 *
 * <p>So the retiring engine had become the vocabulary the replacement was written in, and
 * deleting it was a refactor rather than a delete. It is the wrong way round twice over: an
 * outcome, a gap and a fact are the <em>examination's</em>, and they were the examination's
 * before either engine existed. Neither owns them.
 *
 * <p>Nesting them in one carrier rather than scattering six top-level records follows what
 * {@code ConditionTree}, {@code ExprProgram} and {@code DecisionTable} already do: types that
 * are only ever read together are read together. Nothing else changed — the records, their
 * javadoc and their behaviour are as they were.
 *
 * <h2>What it is NOT</h2>
 *
 * <p>Not neutral, and not meant to be. {@link Gap} knows a document can fail to be presented
 * and {@link RowResult#judged} names an operator; both are the examination's business. The
 * engine below has no idea any of this exists, and that is the boundary that matters.
 */
public final class Evidence {

    private Evidence() {
    }

    public enum Outcome { PASS, FAIL, INCONCLUSIVE }

    /**
     * Why a row could not be settled — and it matters who has to act on it.
     *
     * <p>"The field was not available" is two entirely different situations wearing one
     * answer, and the difference decides whose problem it is:
     *
     * <ul>
     *   <li><b>NOT_PRESENTED</b> — the document is not in the bundle. Nothing was read
     *       because there was nothing to read, and that is a fact about the
     *       <em>presentation</em>: the beneficiary did not lodge it. It usually points at a
     *       missing-document discrepancy that another check raises properly.
     *   <li><b>NOT_EXTRACTED</b> — the document <em>is</em> there and we did not read the
     *       field off it. That is a fact about <em>us</em>. It is an extraction gap, it is
     *       fixable, and reporting it as though the documents were at fault hides the one
     *       signal that would get it fixed.
     *   <li><b>UNPARSEABLE</b> — something was read and could not be used as a date or a
     *       number. Both parties can see the value; nobody can compare it.
     *   <li><b>HUMAN_ONLY</b> — <em>not an absence at all.</em> Everything was read, the
     *       comparison was made, and a graded condition put the answer beyond what a
     *       comparison may settle: the rulebook itself says a person must look. Folded into
     *       UNPARSEABLE it would read as an extraction failure and join a list of fields to
     *       go and fix, which is a week spent on a field that is working perfectly.
     * </ul>
     *
     * <p>All four still produce DOUBT, because a check that could not run has not passed.
     * What changes is what the officer is told to do about it — and, over a hundred cases,
     * whether "our reading is weak here" is visible at all.
     */
    public enum Gap { NOT_PRESENTED, NOT_EXTRACTED, UNPARSEABLE, HUMAN_ONLY }

    /**
     * One reading, as a check needs it.
     *
     * <p>Its own type rather than the persistence row, and the build enforces that: a rule
     * engine coupled to column names would turn a schema rename into a change in how an
     * examination is decided. Four values are all a comparison needs — which field, on which
     * document, what it says, and what to call it when explaining itself.
     *
     * @param multiValued more than one value was read for this field and stored in one cell,
     *                    because the fact model has nowhere to put the second. Comparing that
     *                    cell is worse than not comparing it: "SHANGHAI" against
     *                    '["SHANGHAI","NINGBO"]' is not equal, so the rule reports a
     *                    discrepancy that does not exist and is indistinguishable from one
     *                    that does. Such a row is answered INCONCLUSIVE instead.
     */
    public record Fact(String fieldKey, String docCode, String label, String value,
                       boolean multiValued) {

        public Fact(String fieldKey, String docCode, String label, String value) {
            this(fieldKey, docCode, label, value, false);
        }
    }

    /**
     * One side of a comparison, resolved.
     *
     * <p>Structured rather than rendered, and this is the whole difference between an exact
     * check the officer can read and one they have to take on trust. It used to be two
     * strings — the value, and a sentence with the field name and document folded into it —
     * so the workbench recovered the document by looking for {@code " on "} in an English
     * phrase. Which document a failed comparison points at is not something to parse out of
     * prose written for a person.
     *
     * @param resolved whether anything was actually read. False is not an error and not a
     *                 zero: it is the reason the row is INCONCLUSIVE, and the screen prints
     *                 "not extracted" where the value would go.
     * @param multi    whether more than one value was read for this field and stored in one
     *                 cell. It is resolved — something was read — and it is not comparable,
     *                 which is a third state the other two flags cannot express.
     */
    public record Side(String doc, String field, String label, String value,
                       boolean resolved, boolean literal, boolean multi) {

        Side(String doc, String field, String label, String value, boolean resolved, boolean literal) {
            this(doc, field, label, value, resolved, literal, false);
        }

        String text() {
            return value == null ? "" : value;
        }

        /** How it is named to an examiner: "Expiry date on LC". */
        String describe() {
            if (literal) return "\"" + text() + "\"";
            if (label == null) return field == null ? "?" : field;
            return doc == null ? label : label + " on " + doc;
        }
    }

    /**
     * How one comparison came out.
     *
     * @param op    the operator as authored. Carried rather than phrased here: "is on or
     *              before" is {@link Operator#label()}, and putting a second copy of that
     *              vocabulary in Java is how the two come to disagree.
     * @param why   plain language — shown as the reason on a finding, so it is written for
     *              an examiner rather than as a debug string
     */
    public record RowResult(String id, String op, String label, Outcome outcome,
                            Side left, Side right, String tol, String why, Gap gap) {

        RowResult(String id, String op, String label, Outcome outcome,
                  Side left, Side right, String tol, String why) {
            this(id, op, label, outcome, left, right, tol, why, null);
        }

        /**
         * A question an examiner answered, as a row.
         *
         * <p>The same record a comparison produces, so one evidence view serves both and an
         * officer is not asked to read two shapes. There are no operands: the question IS the
         * label, and {@code why} is the sentence naming what was read.
         */
        public static RowResult judged(String id, String question, Outcome outcome, String why) {
            Side none = new Side(null, null, null, null, false, false, false);
            return new RowResult(id, Operator.UNKNOWN.wire(), question, outcome, none, none,
                    null, why, outcome == Outcome.INCONCLUSIVE ? Gap.HUMAN_ONLY : null);
        }

        public RowResult withGap(Gap gap) {
            return new RowResult(id, op, label, outcome, left, right, tol, why, gap);
        }
    }

    /**
     * How the check came out.
     *
     * @param message the author's own Raise line — the wording that goes on the discrepancy.
     *                Null when none was written, and then {@link #why()} stands in.
     * @param rows    every comparison, in the order the author wrote them
     */
    public record Result(Outcome outcome, List<RowResult> rows, String why,
                         String scope, String message) {

        public boolean failed() {
            return outcome == Outcome.FAIL;
        }

        /** The first row that failed, which is what a finding quotes. */
        public Optional<RowResult> firstFailure() {
            return rows.stream().filter(r -> r.outcome() == Outcome.FAIL).findFirst();
        }

        /** Index of that row, for {@code lc_finding.failed_row}. */
        public Integer failedRowIndex() {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).outcome() == Outcome.FAIL) return i;
            }
            return null;
        }

        /** Whether anything here needs an examiner rather than another comparison. */
        public boolean needsJudgement() {
            return rows.stream().anyMatch(r -> r.why() != null && r.why().startsWith(JUDGEMENT_PREFIX));
        }

        /**
         * Why this could not be settled, where it could not.
         *
         * <p>A missing document beats a missing field beats an unusable value. Not because
         * one is worse, but because a document that was never lodged explains every field it
         * would have carried — telling the officer three fields were unreadable when the
         * bill of lading simply is not there is three restatements of one fact.
         */
        public Gap gap() {
            for (Gap g : List.of(Gap.NOT_PRESENTED, Gap.NOT_EXTRACTED, Gap.UNPARSEABLE,
                                 Gap.HUMAN_ONLY)) {
                if (rows.stream().anyMatch(r -> r.gap() == g)) return g;
            }
            return null;
        }

        /**
         * The engine's answer in the examination's own words.
         *
         * <p>The one translation between the two vocabularies, and it lives here so the two
         * stages that settle exact rules cannot disagree about it. They did: the run wrote a
         * finding for every outcome, and the threshold stage wrote one only when the rule
         * FAILED — so a gate that could not be settled left nothing on the case at all, and
         * a screen reading "no finding" showed it as clean. A threshold check reporting a
         * presentation it never managed to examine as clean is the worst answer this system
         * can give.
         *
         * <p>Three outcomes to three words, and no fourth: {@code NOT_RUN} is the case this
         * cannot express, because a Result exists only where something ran.
         */
        public String outcomeWord() {
            return switch (outcome) {
                case FAIL -> "DISCREPANT";
                case PASS -> "CLEAN";
                // Not CLEAN. A check that could not be run has not passed, and reporting it
                // as clean is how an examination comes to claim it looked at something it
                // did not.
                case INCONCLUSIVE -> "DOUBT";
            };
        }

        /** Why an absence is an absence, or null where this concluded. */
        public String reasonWord() {
            if (outcome != Outcome.INCONCLUSIVE) return null;
            Gap g = gap();
            return switch (g == null ? Gap.UNPARSEABLE : g) {
                case NOT_PRESENTED -> "NOT_PRESENTED";
                case NOT_EXTRACTED -> "NOT_EXTRACTED";
                case UNPARSEABLE -> "UNANSWERABLE";
                // Not an absence at all — see Gap.
                case HUMAN_ONLY -> "HUMAN_ONLY";
            };
        }

        /** The row a finding quotes — the one that failed, or the first left unsettled. */
        public Optional<RowResult> firstUnsettled() {
            return firstFailure().or(() -> rows.stream()
                    .filter(r -> r.outcome() == Outcome.INCONCLUSIVE).findFirst());
        }

        /** The wording a discrepancy is raised under. */
        public String raise() {
            return message == null || message.isBlank() ? why : message;
        }
    }

    static final String JUDGEMENT_PREFIX = "Needs an examiner: ";
}
