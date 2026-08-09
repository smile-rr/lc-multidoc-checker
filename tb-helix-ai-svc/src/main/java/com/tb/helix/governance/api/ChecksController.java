package com.tb.helix.governance.api;

import com.tb.helix.governance.persistence.GovernanceStore;
import com.tb.helix.governance.spi.ExpressionRules;
import com.tb.helix.harness.table.DecisionTable;
import com.tb.helix.harness.expr.ExprResult;
import com.tb.helix.harness.expr.ExpressionEngine;
import com.tb.helix.harness.expr.Values;

import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Authoring checks.
 *
 * <p>The one section with logic worth naming: a check's conditions are a separate document
 * from the check, and saving them is what recomputes whether it could be a hard check.
 */
@RestController
@RequestMapping("/api/v1/governance/checks")
public class ChecksController {

    private final GovernanceStore store;
    private final ExpressionRules expressions;
    private final ExpressionEngine engine;

    public ChecksController(GovernanceStore store, ExpressionRules expressions,
                            ExpressionEngine engine) {
        this.store = store;
        this.expressions = expressions;
        this.engine = engine;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> check) {
        store.saveCheck(check);
        return Map.of("id", String.valueOf(check.get("id")));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> save(@PathVariable String id, @RequestBody Map<String, Object> check) {
        check.put("id", id);
        store.saveCheck(check);
        return Map.of("id", id, "saved", true);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        store.deleteCheck(id);
        return Map.of("deleted", id);
    }

    /**
     * The conditions of an exact check.
     *
     * <p>Answers with eligibility, because saving a rule can change it: move an operand onto
     * a presented document and the check stops being able to run first. The author should
     * see that in the same breath as the edit, not on the next page load.
     */
    @PatchMapping("/{id}/rule")
    public Map<String, Object> saveRule(@PathVariable String id, @RequestBody Map<String, Object> rule) {
        // An expression is refused rather than stored broken. A tree cannot be: its editor is
        // a form and a half-built row is a normal state of authoring, so the console shows
        // the problems and saves anyway. Text has no half-built state — an expression that
        // does not compile is one somebody stopped typing in the middle of, and storing it
        // would give the plan a check that can never run and no way to notice.
        DecisionTable table = DecisionTable.of(rule);
        if (table != null) {
            // The table's own structure first — every WHEN has a THEN, and there is an
            // ELSE — then each condition against the dictionary. Both are refusals, and both
            // are reported together so an author fixes one thing rather than discovering the
            // second only after fixing the first.
            List<String> problems = new ArrayList<>(table.problems());
            // A table with a question is JUDGED however it was typed — that is the whole
            // of what "agent check" now means, and it is derived rather than declared for
            // the reason `tier` always has been: a stored opinion about a derivation is a
            // thing that comes to disagree with it.
            boolean judgement = table.judged();
            List<Map<String, String>> reads = new ArrayList<>();
            for (String source : table.sources()) {
                ExpressionRules.Checked checked = expressions.check(source);
                problems.addAll(checked.problems());
                judgement |= checked.judgement();
                // Union across the table. What the check reads is what any branch of it may
                // read: gate eligibility and v_dangling_reference both ask that question of
                // the check, and a branch's operands are no less the check's for being on a
                // line that did not match this time.
                checked.reads().stream()
                        .<Map<String, String>>map(r -> Map.of("doc", r.doc(), "field", r.field()))
                        .filter(r -> !reads.contains(r))
                        .forEach(reads::add);
            }
            if (!problems.isEmpty()) {
                return Map.of("saved", false, "problems", problems);
            }
            store.saveRule(id, rule);
            // In the same breath as the rule, because the facet IS the rule as far as the
            // views are concerned: saved without it, the check draws as having no conditions
            // and can never be a threshold check.
            store.saveFacet(id, "EXPRESSION", judgement, reads);
        } else {
            store.saveRule(id, rule);
            // A tree's operands are readable in SQL, so a facet would be a second answer to
            // a question the view already answers — and a stale one would keep an old
            // condition's documents alive in gate eligibility.
            store.dropFacet(id);
        }
        Map<String, Object> out = new LinkedHashMap<>(store.gateEligibility(id));
        out.put("saved", true);
        return out;
    }

    /**
     * Trying a condition out, before it is anybody's rule.
     *
     * <p>The author gives the values and gets back every comparison the condition makes, what
     * each came to, and the whole thing read back with the values in place. It is the
     * difference between writing a condition and knowing what one does — and an expression is
     * text, so without it the first time an author learns what theirs does is on a real
     * presentation.
     *
     * <p>Deliberately not a save: nothing here touches the catalogue, and the values are the
     * author's own rather than any case's.
     */
    @PostMapping("/expression:try")
    public Map<String, Object> tryExpression(@RequestBody Map<String, Object> body) {
        // The whole table, which is the interesting case: the same values come out clean,
        // doubt or discrepancy depending on which WHEN matched, and an author who could only
        // try one branch at a time could never see that.
        DecisionTable rule = DecisionTable.of(body);
        if (rule == null) return Map.of("ok", false, "problems", List.of("There is no condition here."));

        List<String> problems = new ArrayList<>(rule.problems());
        List<String> names = new ArrayList<>();
        for (String source : rule.sources()) {
            ExpressionRules.Checked checked = expressions.check(source);
            problems.addAll(checked.problems());
            checked.program().names().stream().filter(n -> !names.contains(n)).forEach(names::add);
        }
        if (!problems.isEmpty()) return Map.of("ok", false, "problems", problems);

        Map<String, Object> given = body.get("values") instanceof Map<?, ?> m
                ? new LinkedHashMap<>(m.entrySet().stream().collect(LinkedHashMap::new,
                        (acc, e) -> acc.put(String.valueOf(e.getKey()), e.getValue()), Map::putAll))
                : new LinkedHashMap<>();
        // A blank box is a value nobody typed, and that is exactly "not read" — which is the
        // state most worth being able to try, because it is the one an author never predicts.
        given.values().removeIf(v -> v == null || String.valueOf(v).isBlank());
        // Read as the dictionary's kind, exactly as a run reads a fact. Bound as plain text
        // this compared a String with a LocalDate wherever a verb computed the other side, so
        // the simulator answered "could not be answered" for a condition that works.
        Map<String, Object> values = new LinkedHashMap<>();
        given.forEach((name, raw) -> {
            Object typed = expressions.read(name, String.valueOf(raw));
            if (typed != null) values.put(name, typed);
        });

        // The same walk an examination makes, asked of the same type. Re-deciding it here from
        // the per-clause verdicts would be a second opinion about what a graded check means.
        List<Map<String, Object>> rungs = new ArrayList<>();
        DecisionTable.Decision decision = rule.decide(i -> {
            DecisionTable.Branch branch = rule.branches().get(i);
            ExprResult r = engine.run(branch.when(), values);
            DecisionTable.Answer answer = answer(r.verdict());

            Map<String, Object> rung = new LinkedHashMap<>();
            rung.put("index", i);
            rung.put("when", branch.when());
            // What this branch answers if it matches, and whether it did. Two different
            // things: a branch can match and answer "clean", or not match at all.
            rung.put("then", branch.then() == null ? null : branch.then().name());
            rung.put("matched", answer == DecisionTable.Answer.TRUE);
            rung.put("outcome", outcomeOf(branch, answer).name());
            rung.put("reading", r.reading() == null ? "" : r.reading());
            // Every comparison in the examination's own three words, decided HERE. The
            // browser rendering "did not hold" and leaving a reader to work out whether that
            // was a discrepancy is a translation, and a translation is a place to be wrong.
            rung.put("leaves", r.leaves().stream()
                    .map(l -> leaf(l, branch, answer)).toList());
            rungs.add(rung);
            return answer;
        });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("reads", names);
        // What the check would report. Not the last rung's TRUE/FALSE — a rung holding can
        // still leave the check in doubt, which is the whole reason a ladder exists.
        out.put("outcome", decision.verdict().name());
        out.put("decidedBy", decision.matched());
        out.put("unsettled", decision.unsettled());
        out.put("rungs", rungs);
        // The single-condition answer, unchanged, so a caller that asked one question still
        // gets one answer in the shape it already reads.
        Map<String, Object> first = rungs.isEmpty() ? Map.of() : rungs.get(0);
        out.put("verdict", first.getOrDefault("verdict", "UNKNOWN"));
        out.put("reading", first.getOrDefault("reading", ""));
        out.put("leaves", first.getOrDefault("leaves", List.of()));
        return out;
    }

    /**
     * What a branch came to, in the examination's own three words.
     *
     * <p>A branch that matched answers what its THEN says. A branch that did not is not a
     * fault — the table simply moves on — so it reads CLEAN rather than borrowing the
     * outcome of a line that never applied. One that could not be answered is the DOUBT that
     * stopped the table.
     */
    /**
     * The engine's verdict as the table's answer.
     *
     * <p>The same three lines exist in {@code ExpressionEvaluator}, and they stay two copies
     * on purpose: this module may not see lc-check, and contorting the layering so one
     * three-arm switch could be shared would cost more than the switch. What is <b>not</b>
     * duplicated is the walk itself — both call {@link DecisionTable#decide}, which is the
     * part that has to agree.
     */
    private static DecisionTable.Answer answer(ExprResult.Verdict verdict) {
        return switch (verdict) {
            case TRUE -> DecisionTable.Answer.TRUE;
            case FALSE -> DecisionTable.Answer.FALSE;
            case UNKNOWN -> DecisionTable.Answer.UNKNOWN;
        };
    }

    private static DecisionTable.Verdict outcomeOf(DecisionTable.Branch branch,
                                                    DecisionTable.Answer answer) {
        return switch (answer) {
            case TRUE -> branch.then() == null ? DecisionTable.Verdict.DOUBT : branch.then();
            case FALSE -> DecisionTable.Verdict.CLEAN;
            case UNKNOWN -> DecisionTable.Verdict.DOUBT;
        };
    }

    /**
     * One comparison, and what the branch made of it.
     *
     * <p>A comparison that came back false inside a branch that still MATCHED contributed
     * nothing — under {@code or} a false leaf beside a true one decides nothing — so it reads
     * the branch's own answer, and {@code critical} is what says which leaf actually
     * mattered. Labelling every false leaf a discrepancy would put faults on screen the
     * table never found.
     */
    private static Map<String, Object> leaf(ExprResult.LeafResult l,
                                            DecisionTable.Branch branch,
                                            DecisionTable.Answer answer) {
        DecisionTable.Answer contributed = switch (l.outcome()) {
            case TRUE -> DecisionTable.Answer.TRUE;
            case UNKNOWN -> DecisionTable.Answer.UNKNOWN;
            // A false leaf only carries the branch's answer when it is why the branch failed.
            case FALSE -> answer == DecisionTable.Answer.TRUE
                    ? DecisionTable.Answer.TRUE : DecisionTable.Answer.FALSE;
        };
        Map<String, Object> out = leaf(l);
        out.put("outcome", outcomeOf(branch, contributed).name());
        return out;
    }

    private static Map<String, Object> leaf(ExprResult.LeafResult l) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("source", l.source());
        out.put("op", l.op());
        out.put("verdict", l.outcome().name());
        out.put("critical", l.critical());
        out.put("why", l.why());
        out.put("operands", l.operands().stream().map(o -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", o.name());
            m.put("value", Values.show(o.value()));
            m.put("resolved", o.resolved());
            return m;
        }).toList());
        return out;
    }

    @GetMapping("/{id}/gate")
    public Map<String, Object> gate(@PathVariable String id) {
        return store.gateEligibility(id);
    }

    /**
     * Turning a threshold check on or off, and saying what its failure means.
     *
     * <p>Turning it on is refused when the check cannot run first. Eligibility is derived
     * from the dictionary; a stored flag contradicting the derivation is a lie the run would
     * have to resolve, and it would resolve it by not running the gate at all.
     *
     * <p>{@code onFail} is the second half and is never refused: {@code STOP} or
     * {@code CONTINUE}. It is the author's judgement about what a failure settles, and the
     * planner may still overrule it for one credit whose own terms bear on the question.
     */
    @PostMapping("/{id}/gate")
    public Map<String, Object> setGate(@PathVariable String id, @RequestBody Map<String, Object> body) {
        boolean on = Boolean.TRUE.equals(body.get("on"));
        Map<String, Object> eligibility = store.gateEligibility(id);
        if (on && !Boolean.TRUE.equals(eligibility.get("eligible"))) return eligibility;
        store.setGate(id, on, String.valueOf(body.getOrDefault("onFail", eligibility.get("onFail"))));
        return store.gateEligibility(id);
    }
}
