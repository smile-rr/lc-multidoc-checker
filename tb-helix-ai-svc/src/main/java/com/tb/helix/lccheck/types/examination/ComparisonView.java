package com.tb.helix.lccheck.types.examination;

import java.util.List;

/**
 * The working behind a finding an exact check produced.
 *
 * <p>This is what an exact check has that a judged one cannot: not a verdict but the
 * comparison itself, every row of it, with what was actually read on each side. It is the
 * screen that answers "on what basis" in a dispute, and it is the reason a compiled
 * requirement — written during the run and reviewed by nobody — is safe to act on.
 *
 * <p><b>It was being written and thrown away.</b> The rows went into {@code
 * lc_finding.comparison} on every exact check and no read path carried them, so against the
 * live service the review screen showed a verdict and a sentence, and the fixtures — where
 * the shape was resolved client-side — showed the table. The design was in the mock.
 *
 * <h2>One shape, two saturations</h2>
 *
 * <p>Deliberately the same row as the plan screen draws, with values added:
 *
 * <ul>
 *   <li><b>Before the run</b> the plan shows what a check <em>intends</em> to compare — the
 *       operands, the operator, the qualifier. {@link Side#value} is null.
 *   <li><b>After it</b> this shows what it <em>did</em> compare — the same row, each side
 *       carrying what was read and whether anything was.
 * </ul>
 *
 * <p>So the browser draws both with one component, and there is no second vocabulary for
 * "the comparison as run" to drift from "the comparison as authored".
 *
 * @param message   the author's Raise line — the wording the discrepancy is stated in
 * @param failedRow which row broke, or null. An index into {@code rows}, not a copy of it.
 */
public record ComparisonView(String scope, String message, Integer failedRow, List<Line> rows) {

    /**
     * One comparison, as it reads.
     *
     * <p>Named a line rather than a row on purpose, and the build enforces it: a row is the
     * schema's shape, and a wire type carrying that name would invite a column rename to
     * reach the browser.
     *
     * @param op       the wire name, for anything that has to match on it
     * @param opLabel  how an examiner reads it — "is on or before". Resolved once, on the
     *                 server, from the one enum that holds the vocabulary.
     * @param label    the whole line as a sentence, for a narrow screen and for a log line
     * @param outcome  {@code PASS} · {@code FAIL} · {@code INCONCLUSIVE} — the rule engine's
     *                 own three, not the officer's four. A row is not a finding.
     * @param tol      the qualifier, but only where the operator reads one. Blank elsewhere,
     *                 so the screen cannot show an author's inert note as if it applied.
     * @param gap      why an INCONCLUSIVE row is inconclusive — {@code NOT_PRESENTED} ·
     *                 {@code NOT_EXTRACTED} · {@code UNPARSEABLE}. Null on a row that
     *                 settled. Per row rather than only per finding, because one check can
     *                 be blocked by a missing document on one row and an unread field on
     *                 another, and those are two different things to go and do.
     */
    public record Line(String id, String op, String opLabel, String label, String outcome,
                       String tol, Side left, Side right, String why, String gap) {
    }

    /**
     * One side, as it resolved.
     *
     * @param doc      the document code the operand named, or null for a fixed value. This
     *                 is what the viewer opens when the officer clicks the failed row — it
     *                 used to be recovered by searching for " on " inside {@link Line#label}.
     * @param resolved whether anything was read. False is why a row is INCONCLUSIVE, and the
     *                 screen prints "not extracted" rather than an empty string, because an
     *                 empty string looks like a value that happened to be blank.
     */
    public record Side(String doc, String docLabel, String field, String label,
                       String value, boolean resolved, boolean literal) {
    }
}
