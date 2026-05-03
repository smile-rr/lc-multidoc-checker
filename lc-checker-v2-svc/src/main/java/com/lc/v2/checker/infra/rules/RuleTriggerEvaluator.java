package com.lc.v2.checker.infra.rules;

import com.lc.v2.checker.domain.rule.ExamineContext;
import com.lc.v2.checker.domain.rule.Rule;
import com.lc.v2.checker.domain.rule.Triggers;
import com.lc.v2.checker.domain.rule.Triggers.AllOf;
import com.lc.v2.checker.domain.rule.Triggers.AnyOf;
import com.lc.v2.checker.domain.rule.Triggers.ConsistencyOk;
import com.lc.v2.checker.domain.rule.Triggers.DerivedEquals;
import com.lc.v2.checker.domain.rule.Triggers.DocsPresent;
import com.lc.v2.checker.domain.rule.Triggers.LcFieldContains;
import com.lc.v2.checker.domain.rule.Triggers.LcFieldEquals;
import com.lc.v2.checker.domain.rule.Triggers.LcFieldPresent;
import com.lc.v2.checker.domain.rule.Triggers.Not;
import com.lc.v2.checker.domain.rule.Triggers.TriggerNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Evaluates a Rule's compound trigger against an ExamineContext.
 *
 * <p>Distinguishes three outcomes:
 * <ul>
 *   <li>{@code FIRE} — every node matched; rule should be evaluated.</li>
 *   <li>{@code NOT_APPLICABLE} — visible miss (LC field absent, derived class doesn't match,
 *       LC clause contradictory). Result row written for officer.</li>
 *   <li>{@code SKIP} — silent miss (a {@code DocsPresent} node failed). Officer never sees the
 *       row; preserves the v1 behaviour where a rule's doc universe is simply absent.</li>
 * </ul>
 */
@Component
public class RuleTriggerEvaluator {

    public enum Outcome { FIRE, NOT_APPLICABLE, SKIP }

    public record TriggerDecision(Outcome outcome, List<String> trace) {
        public TriggerDecision {
            trace = trace == null ? List.of() : List.copyOf(trace);
        }
    }

    /** Result of recursive evaluation of a single trigger node. */
    private record NodeResult(boolean matched, boolean docMiss, String reason) {}

    public TriggerDecision evaluate(Rule rule, ExamineContext ctx) {
        TriggerNode root = rule.triggers();
        if (root == null && rule.triggerDocs() != null && !rule.triggerDocs().isEmpty()) {
            // Back-compat: synthesise AllOf(DocsPresent(triggerDocs)).
            root = new AllOf(List.of(new DocsPresent(rule.triggerDocs())));
        }
        if (root == null) {
            return new TriggerDecision(Outcome.FIRE, List.of("no trigger — fires by default"));
        }
        List<String> trace = new ArrayList<>();
        NodeResult r = eval(root, ctx, trace);
        if (r.matched()) return new TriggerDecision(Outcome.FIRE, trace);
        if (r.docMiss()) return new TriggerDecision(Outcome.SKIP, trace);
        return new TriggerDecision(Outcome.NOT_APPLICABLE, trace);
    }

    private NodeResult eval(TriggerNode node, ExamineContext ctx, List<String> trace) {
        if (node instanceof DocsPresent n) {
            for (String doc : n.docs()) {
                if (!ctx.presentedDocTypes().contains(doc)) {
                    String reason = "doc " + doc + " not presented";
                    trace.add("docs_present[" + doc + "] missing");
                    return new NodeResult(false, true, reason);
                }
            }
            trace.add("docs_present" + n.docs() + " all present");
            return new NodeResult(true, false, null);
        }
        if (node instanceof LcFieldPresent n) {
            for (String field : n.fields()) {
                Object v = ctx.lcFields().get(field);
                String cs = ctx.consistencyClauses().get(field);
                if (cs != null && cs.startsWith("CONTRADICTORY")) {
                    trace.add("lc_field_present[" + field + "] " + cs);
                    return new NodeResult(false, false, "field " + field + " " + cs);
                }
                if (v == null || v.toString().isBlank()) {
                    trace.add("lc_field_present[" + field + "] absent");
                    return new NodeResult(false, false, "LC field absent: " + field);
                }
            }
            trace.add("lc_field_present" + n.fields() + " all present");
            return new NodeResult(true, false, null);
        }
        if (node instanceof LcFieldEquals n) {
            String field = n.field();
            Object v = ctx.lcFields().get(field);
            if (v == null) {
                trace.add("lc_field_equals[" + field + "] absent");
                return new NodeResult(false, false, "LC field absent: " + field);
            }
            String s = v.toString().trim();
            for (String want : n.values()) {
                if (s.equalsIgnoreCase(want)) {
                    trace.add("lc_field_equals[" + field + "=" + s + "] matches");
                    return new NodeResult(true, false, null);
                }
            }
            trace.add("lc_field_equals[" + field + "=" + s + "] not in " + n.values());
            return new NodeResult(false, false, "LC " + field + "=" + s + " not in " + n.values());
        }
        if (node instanceof LcFieldContains n) {
            String field = n.field();
            Object v = ctx.lcFields().get(field);
            if (v == null) {
                trace.add("lc_field_contains[" + field + "] absent");
                return new NodeResult(false, false, "LC field absent: " + field);
            }
            String s = v.toString();
            String haystack = n.caseInsensitiveOrDefault() ? s.toUpperCase(Locale.ROOT) : s;
            String needle = n.caseInsensitiveOrDefault() && n.needle() != null
                    ? n.needle().toUpperCase(Locale.ROOT) : n.needle();
            if (needle != null && haystack.contains(needle)) {
                trace.add("lc_field_contains[" + field + " ~ '" + n.needle() + "'] matches");
                return new NodeResult(true, false, null);
            }
            trace.add("lc_field_contains[" + field + " ~ '" + n.needle() + "'] no match");
            return new NodeResult(false, false,
                    "LC " + field + " does not contain '" + n.needle() + "'");
        }
        if (node instanceof DerivedEquals n) {
            String key = n.key();
            Object v = ctx.lcDerived().get(key);
            if (v == null) {
                trace.add("derived_equals[" + key + "] absent");
                return new NodeResult(false, false, "derived." + key + " not computed");
            }
            String s = v.toString().trim();
            for (String want : n.values()) {
                if (s.equalsIgnoreCase(want)) {
                    trace.add("derived_equals[" + key + "=" + s + "] matches");
                    return new NodeResult(true, false, null);
                }
            }
            trace.add("derived_equals[" + key + "=" + s + "] not in " + n.values());
            return new NodeResult(false, false,
                    "derived." + key + "=" + s + " not in " + n.values());
        }
        if (node instanceof ConsistencyOk n) {
            String clause = n.clauseId();
            String status = ctx.consistencyClauses().getOrDefault(clause, "OK");
            if ("OK".equals(status)) {
                trace.add("consistency_ok[" + clause + "] OK");
                return new NodeResult(true, false, null);
            }
            trace.add("consistency_ok[" + clause + "] " + status);
            return new NodeResult(false, false, clause + " " + status);
        }
        if (node instanceof Not n) {
            NodeResult inner = eval(n.child(), ctx, new ArrayList<>());
            boolean matched = !inner.matched();
            trace.add("not(" + (inner.matched() ? "match" : "no-match") + ") → "
                    + (matched ? "match" : "no-match"));
            return new NodeResult(matched, false,
                    matched ? null : "negated condition held: " + inner.reason());
        }
        if (node instanceof AnyOf n) {
            String lastReason = null;
            boolean anyDocMiss = false;
            for (TriggerNode child : n.children()) {
                NodeResult r = eval(child, ctx, trace);
                if (r.matched()) {
                    trace.add("any_of → matched");
                    return new NodeResult(true, false, null);
                }
                anyDocMiss = anyDocMiss || r.docMiss();
                lastReason = r.reason();
            }
            trace.add("any_of → no branch matched");
            // If every branch was a docMiss, propagate as docMiss; otherwise NA.
            return new NodeResult(false, anyDocMiss && allDocMiss(n.children(), ctx),
                    Objects.toString(lastReason, "no branch matched"));
        }
        if (node instanceof AllOf n) {
            for (TriggerNode child : n.children()) {
                NodeResult r = eval(child, ctx, trace);
                if (!r.matched()) {
                    trace.add("all_of → short-circuit on miss");
                    return new NodeResult(false, r.docMiss(), r.reason());
                }
            }
            trace.add("all_of → all branches matched");
            return new NodeResult(true, false, null);
        }
        trace.add("unknown trigger node: " + node.getClass().getSimpleName());
        return new NodeResult(false, false, "unknown trigger node");
    }

    private boolean allDocMiss(List<TriggerNode> children, ExamineContext ctx) {
        for (TriggerNode child : children) {
            NodeResult r = eval(child, ctx, new ArrayList<>());
            if (!r.docMiss() && !r.matched()) return false;
        }
        return true;
    }
}
