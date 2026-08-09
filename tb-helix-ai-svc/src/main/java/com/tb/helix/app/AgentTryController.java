package com.tb.helix.app;

import com.tb.helix.harness.table.DecisionTable;
import com.tb.helix.harness.llm.tool.ToolSpec;
import com.tb.helix.lccheck.persistence.CaseStore;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.rule.ConditionAsker;
import com.tb.helix.lccheck.rule.ExpressionEvaluator;
import com.tb.helix.lccheck.rule.Evidence;
import com.tb.helix.lccheck.rule.RuleEvaluator;
import com.tb.helix.lccheck.rule.SettleTool;
import com.tb.helix.lccheck.service.FactWriter;

import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Trying an agent check, against a real case.
 *
 * <h2>Why this is in {@code app} and not in governance</h2>
 *
 * <p>It needs two things that never meet anywhere else: the <b>catalogue's</b> idea of a table,
 * and an <b>examination's</b> facts. Governance may not see lc-check and lc-check may not see
 * governance's internals, and neither should learn to — so the one place that legitimately
 * knows both is the layer whose whole job is wiring them together.
 *
 * <h2>It is the same path the run takes</h2>
 *
 * <p>The same pre-walk, the same prompt, the same {@code settle} tool bound to the same facts,
 * the same parse, the same {@link DecisionTable#decide}. Nothing here is a rehearsal of the
 * examination written twice — a try panel that runs its own version of the check answers a
 * question the examination never asks, and it fails in the direction of "it worked when I
 * tested it".
 *
 * <p><b>It costs money.</b> Every call to this is a real completion against a real model, and
 * the response says what it spent so the console can too. That is the difference between this
 * and {@code expression:try}, and it is why the button has to say so.
 */
@RestController
@RequestMapping("/api/v1/governance/checks")
public class AgentTryController {

    private final CaseStore cases;
    private final ExpressionEvaluator expressions;
    private final ConditionAsker asker;
    private final SettleTool settle;

    public AgentTryController(CaseStore cases, ExpressionEvaluator expressions,
                              ConditionAsker asker, SettleTool settle) {
        this.cases = cases;
        this.expressions = expressions;
        this.asker = asker;
        this.settle = settle;
    }

    /**
     * @param body {@code source} — the table as typed; {@code caseId} — whose facts to read.
     */
    @PostMapping("/agent:try")
    public Map<String, Object> tryAgent(@RequestBody Map<String, Object> body) {
        String source = String.valueOf(body.getOrDefault("source", ""));
        DecisionTable table = DecisionTable.parse(source, null);
        if (table == null) {
            return Map.of("ok", false, "problems", List.of("There is no check here."));
        }
        List<String> problems = new ArrayList<>(table.problems());
        if (!problems.isEmpty()) return Map.of("ok", false, "problems", problems);

        String ref = String.valueOf(body.getOrDefault("caseId", ""));
        if (ref.isBlank()) {
            return Map.of("ok", false, "problems",
                    List.of("Choose a case. An agent check reads what a presentation actually "
                            + "says, so there is nothing to try it against without one."));
        }
        // The panel sends the reference a person quotes; facts are keyed by the row's id.
        String caseId = cases.idForRef(ref).orElse(null);
        if (caseId == null) {
            return Map.of("ok", false, "problems", List.of("No case " + ref + "."));
        }

        List<Evidence.Fact> facts = facts(caseId);
        Set<String> presented = presented(caseId);
        Map<String, Object> rule = Map.of("v", 3, "source", source);

        // The pre-walk, exactly as the run does it: every comparison settled for free, and
        // only the questions a walk could actually arrive at are asked.
        List<Integer> pending = expressions.pending(rule, facts);
        List<ConditionAsker.Question> questions = new ArrayList<>();
        for (int i : pending) {
            questions.add(new ConditionAsker.Question("c" + (i + 1), "try", i,
                    table.branches().get(i).ask()));
        }

        ConditionAsker.Answers answers = questions.isEmpty()
                ? new ConditionAsker.Answers(Map.of(), List.of(), false, null)
                : asker.ask(questions, presentation(facts), null, tool(facts, presented));

        Map<Integer, DecisionTable.Answer> byBranch = new LinkedHashMap<>();
        Map<Integer, String> because = new LinkedHashMap<>();
        for (ConditionAsker.Question q : questions) {
            byBranch.put(q.branch(), answers.of(q.id()));
            because.put(q.branch(), answers.because(q.id()));
        }

        Evidence.Result result = expressions.evaluate(rule, facts, presented,
                new ExpressionEvaluator.Judged(byBranch, because));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("outcome", result.outcomeWord());
        out.put("reason", result.reasonWord());
        // Nothing was asked, so nothing was spent — worth saying, because a check whose cheap
        // branch matched is the design working rather than the panel failing.
        out.put("asked", questions.size());
        out.put("exhausted", answers.exhausted());
        out.put("model", answers.model());
        out.put("conditions", questions.stream().map(q -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ask", q.ask());
            m.put("answer", answers.of(q.id()).name());
            m.put("because", answers.because(q.id()));
            return m;
        }).toList());
        // The comparisons the examiner asked for, which is how an author sees whether their
        // question is doing work or duplicating one they could have written exactly.
        out.put("toolCalls", answers.toolCalls().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tool", c.tool());
            m.put("arguments", c.arguments());
            m.put("result", c.result());
            return m;
        }).toList());
        out.put("rows", result.rows().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("label", r.label());
            m.put("outcome", switch (r.outcome()) {
                case PASS -> "CLEAN";
                case FAIL -> "DISCREPANT";
                case INCONCLUSIVE -> "DOUBT";
            });
            m.put("why", r.why());
            return m;
        }).toList());
        return out;
    }

    /** Cases worth trying against, newest first. */
    @GetMapping("/agent:cases")
    public List<Map<String, Object>> cases() {
        return cases.list("all", null).stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            // caseRef is what a person quotes and what /cases/{ref} takes.
            m.put("caseId", c.caseRef());
            m.put("reference", c.creditRef());
            m.put("beneficiary", c.beneficiary());
            return m;
        }).toList();
    }

    private ToolSpec tool(List<Evidence.Fact> facts, Set<String> presented) {
        return settle.forCase(facts, presented);
    }

    private List<Evidence.Fact> facts(String caseId) {
        return cases.facts(caseId).stream()
                .map(f -> new Evidence.Fact(f.fieldKey(), f.docCode(), f.label(), f.value(),
                        FactWriter.MULTI_VALUED.equals(f.flag())))
                .toList();
    }

    private Set<String> presented(String caseId) {
        Set<String> out = new LinkedHashSet<>();
        for (ReadRows.Document d : cases.documents(caseId)) out.add(d.docCode());
        return out;
    }

    /** The fact sheet, plainly. The run builds a richer one; this is the same shape. */
    private static String presentation(List<Evidence.Fact> facts) {
        StringBuilder sb = new StringBuilder("THE PRESENTATION\n\n");
        for (Evidence.Fact f : facts) {
            sb.append("  ").append(f.docCode()).append('.').append(f.fieldKey())
              .append("  ").append(f.value() == null ? "—" : f.value()).append('\n');
        }
        return sb.toString();
    }
}
