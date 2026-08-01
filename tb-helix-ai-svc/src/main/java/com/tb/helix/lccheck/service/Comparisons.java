package com.tb.helix.lccheck.service;

import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.governance.types.Operator;
import com.tb.helix.lccheck.rule.RuleEvaluator;
import com.tb.helix.lccheck.types.examination.ComparisonView;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * The one place a settled comparison becomes something a screen can draw.
 *
 * <p>Two stages produce them — the threshold checks and the run — and both used to build the
 * row list inline, with their own key names, into a jsonb column nothing read back. Two
 * copies of a shape that had no owner is how the gate's rows and the run's rows came to
 * differ in a column neither of them looked at.
 *
 * <p>Its whole job is display: resolving the operator's wire name to the words an examiner
 * reads, and a document code to the document's name. Neither belongs in the rule engine —
 * that would put the dictionary inside the arithmetic — and neither belongs in the browser,
 * because a finding is evidence and evidence is written down once, at the time, rather than
 * re-rendered years later against a dictionary that has moved on.
 */
@Component
public class Comparisons {

    private final DocumentTypes docTypes;

    public Comparisons(DocumentTypes docTypes) {
        this.docTypes = docTypes;
    }

    /**
     * What a check <em>intends</em> to compare, before anything has been read.
     *
     * <p>The same rows, unsaturated: every operand named, no operand resolved, no outcome.
     * That is what the plan screen shows and what makes a compiled requirement readable
     * before it runs — the one kind of check nobody reviewed in advance.
     *
     * <p>Same record as {@link #of}, deliberately. Two shapes for "the comparison as
     * authored" and "the comparison as run" would be two components drawing what an officer
     * reads as one thing, and they would drift the first time either was extended.
     */
    public ComparisonView plan(Object rule) {
        ConditionTree.Parsed parsed = ConditionTree.parse(rule);
        if (!parsed.ok()) return null;
        ConditionTree tree = parsed.tree();

        List<ComparisonView.Line> rows = tree.rows().stream()
                .map(r -> new ComparisonView.Line(
                        r.id(), r.op().wire(), r.op().label(),
                        null,
                        // Not "PASS" and not blank. NOT_RUN is the vocabulary's own word for
                        // an absence, and the plan screen is exactly where it belongs.
                        "NOT_RUN",
                        r.op().usesTol() ? r.tol() : "",
                        operand(r.left()),
                        r.op().unary() ? null : operand(r.right()),
                        null,
                        null))
                .toList();
        return new ComparisonView(tree.scope(), tree.message(), null, rows);
    }

    private ComparisonView.Side operand(ConditionTree.Operand o) {
        if (o.isLiteral()) {
            return new ComparisonView.Side(null, null, null, null, o.literal(), true, true);
        }
        if (o.isComputed()) {
            return new ComparisonView.Side(
                    COMPUTED, where(COMPUTED), o.fn().wire(), o.describe(), null, false, false);
        }
        return new ComparisonView.Side(
                o.doc(), where(o.doc()),
                o.field(), o.field() == null ? null : o.field().replace('_', ' '),
                null, false, false);
    }

    /** What the rule engine settled, as the officer will read it. */
    public ComparisonView of(RuleEvaluator.Result result) {
        List<ComparisonView.Line> rows = result.rows().stream()
                .map(r -> new ComparisonView.Line(
                        r.id(),
                        r.op(),
                        Operator.of(r.op()).label(),
                        r.label(),
                        r.outcome().name(),
                        r.tol(),
                        side(r.left()),
                        // A unary row has no right-hand side, and writing an empty one would
                        // put "is stated ?" on the screen.
                        Operator.of(r.op()).unary() ? null : side(r.right()),
                        r.why(),
                        r.gap() == null ? null : r.gap().name()))
                .toList();
        return new ComparisonView(result.scope(), result.raise(), result.failedRowIndex(), rows);
    }

    /**
     * Where an operand was read from, in words.
     *
     * <p>A computed operand was read from nowhere — it is an addition over two others — so it
     * says that rather than being looked up and coming back "UNKNOWN", which reads like a
     * document we failed to identify.
     */
    private static final String COMPUTED = "computed";

    private String where(String doc) {
        if (doc == null) return null;
        return COMPUTED.equals(doc) ? "Worked out from the presentation" : docTypes.label(doc);
    }

    private ComparisonView.Side side(RuleEvaluator.Side s) {
        if (s == null) return null;
        return new ComparisonView.Side(
                s.doc(),
                where(s.doc()),
                s.field(),
                s.label(),
                s.value(),
                s.resolved(),
                s.literal());
    }
}
