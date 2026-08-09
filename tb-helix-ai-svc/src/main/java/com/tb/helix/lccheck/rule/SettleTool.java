package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.spi.ExpressionRules;
import com.tb.helix.harness.expr.ExprResult;
import com.tb.helix.harness.expr.ExpressionEngine;
import com.tb.helix.harness.llm.tool.ToolSpec;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The one tool an examiner is given: the expression engine, over this case's facts.
 *
 * <p>A model asked <em>"were these documents presented within twenty-one days of shipment"</em>
 * will do the date arithmetic in its head, and will be confidently wrong often enough to
 * matter. Handing it the engine moves the arithmetic to the thing that is exact, and leaves
 * the model the part it is actually good at — reading a goods description and deciding whether
 * two ways of writing it describe one product.
 *
 * <p>It is the <b>same engine, the same dictionary and the same refusals</b> as authoring. A
 * condition naming a field nobody reads is refused here in the sentence an author would have
 * seen; an unsafe construct is refused by the same allow-list. There is no second evaluator
 * for models, because a second evaluator is a second set of answers.
 *
 * <p><b>It cannot change anything.</b> It reads facts already on the case and returns a word.
 * That is what makes it safe to put in a loop with a model.
 */
@Component
public class SettleTool {

    private final ExpressionEngine engine;
    private final ExpressionRules rules;

    public SettleTool(ExpressionEngine engine, ExpressionRules rules) {
        this.engine = engine;
        this.rules = rules;
    }

    /**
     * @param facts     every fact on the case, as the evaluator indexes them
     * @param presented which documents the bundle holds, so an absence can say whose it is
     */
    public ToolSpec forCase(List<RuleEvaluator.Fact> facts, Set<String> presented) {
        Map<String, RuleEvaluator.Fact> byName = new LinkedHashMap<>();
        for (RuleEvaluator.Fact f : facts) {
            if (f.fieldKey() != null && f.docCode() != null) {
                byName.putIfAbsent(f.docCode() + "." + f.fieldKey(), f);
            }
        }

        return new ToolSpec(
                "settle",
                description(),
                Map.of("type", "object",
                        "properties", Map.of("condition", Map.of(
                                "type", "string",
                                "description", "The comparison, in the condition language.")),
                        "required", List.of("condition")),
                args -> settle(String.valueOf(args.get("condition")), byName, presented));
    }

    /**
     * What the tool accepts, in the language's own words.
     *
     * <p>It did not carry this at first, and a real examiner asked for
     * {@code {LC.goods_description} != {INV.goods_description}} — refused, text has no
     * order — then {@code {LC.a} #differs {INV.b}} — refused, a verb is a call and not an
     * infix operator — and then ran out of turns and answered nothing. It had been told to
     * use "the verbs and operators you were given", and it had not been given any.
     *
     * <p>So the grammar and the readable names travel WITH the tool. They are the same two
     * strings the console shows an author and the planner is given, because a model, an
     * author and a compiler disagreeing about the language is the one thing none of them can
     * detect.
     */
    private String description() {
        return """
                Settle a comparison exactly, against what was actually read off this \
                presentation. Use it for anything arithmetic — dates, amounts, day counts, \
                tolerances — rather than working it out yourself.

                It answers true, false, or that it could not be settled and why. "Could not \
                be settled" is an answer: it means a value you assumed was there was never \
                read, and you must not treat it as either true or false.

                THE LANGUAGE

                """ + rules.grammar() + """

                WHAT YOU MAY READ

                """ + rules.vocabulary();
    }

    private String settle(String condition, Map<String, RuleEvaluator.Fact> byName,
                          Set<String> presented) {
        if (condition == null || condition.isBlank()) {
            return "There is no condition here to settle.";
        }
        // Checked before it is run, exactly as an author's would be — so a model asking about
        // a field nobody reads is told so rather than told "false".
        ExpressionRules.Checked checked = rules.check(condition);
        if (!checked.ok()) {
            return "That could not be settled: " + String.join(" ", checked.problems());
        }

        Map<String, Object> values = new LinkedHashMap<>();
        for (String name : checked.program().names()) {
            RuleEvaluator.Fact fact = byName.get(name);
            // Never bound when it was not read, and never bound when the fact holds several
            // values in one cell — the same rule the evaluator enforces, for the same reason.
            if (fact == null || fact.value() == null || fact.value().isBlank()
                    || fact.multiValued()) {
                continue;
            }
            Object typed = rules.read(name, fact.value());
            if (typed != null) values.put(name, typed);
        }

        ExprResult result = engine.run(condition, values);
        return switch (result.verdict()) {
            case TRUE -> "true — " + result.reading();
            case FALSE -> "false — " + result.reading();
            case UNKNOWN -> "could not be settled: " + missing(checked, byName, presented)
                    + " Read back: " + result.reading();
        };
    }

    /** Which value was missing, and whose gap that is — the same distinction a finding draws. */
    private static String missing(ExpressionRules.Checked checked,
                                  Map<String, RuleEvaluator.Fact> byName, Set<String> presented) {
        StringBuilder sb = new StringBuilder();
        for (String name : checked.program().names()) {
            RuleEvaluator.Fact fact = byName.get(name);
            if (fact != null && fact.value() != null && !fact.value().isBlank()
                    && !fact.multiValued()) {
                continue;
            }
            String doc = name.substring(0, Math.max(0, name.indexOf('.')));
            sb.append(sb.isEmpty() ? "" : " ")
              .append(name).append(!presented.isEmpty() && !presented.contains(doc)
                      ? " — that document was not presented."
                      : " — that document is here and the field was not read off it.");
        }
        return sb.isEmpty() ? "a value it needs could not be used." : sb.toString();
    }
}
