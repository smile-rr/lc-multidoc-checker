package com.tb.helix.lccheck.stage.plan;

import com.tb.helix.governance.spi.CheckCatalog;
import com.tb.helix.governance.types.ConditionTree;
import com.tb.helix.harness.llm.tool.ToolSpec;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * What the planner may ask for while it is writing a condition.
 *
 * <h2>Why the tools are here and not in the run</h2>
 *
 * <p>The obvious place to put tools is the examination — give the examiner a calculator, a
 * lookup, a way to fetch a field. It is the wrong place, and the reason is on
 * {@code ExecuteStage}: the facts are already in the prompt, so a tool round trip to hand a
 * model something we are already holding is two extra completions for no new information.
 *
 * <p>The planner is different, and it is different in exactly the way that makes a tool pay.
 * It is <em>writing</em> something — a condition that will run on this credit and be reported
 * to an officer as deterministic — and it cannot tell whether what it wrote is valid.
 * {@code RuleCompiler} can, and it does, but only <em>after</em> the answer comes back: an
 * invalid condition is silently demoted to a judged card and the credit's demand costs a
 * model call on every presentation for ever. The planner never finds out, so it writes the
 * same invalid condition next time.
 *
 * <p>{@link #checkCondition()} closes that loop. The planner drafts, asks, is told "beneficiary
 * is not read from BOE", and rewrites — inside the same call, for the price of one extra
 * completion, against the credit's whole set of demands rather than one at a time. That is the
 * difference between a tool that fetches what we have and a tool that answers a question we
 * cannot answer for the model.
 *
 * <h2>What is deliberately not here</h2>
 *
 * <p>No date arithmetic. It was on the plan for this and it earned its way off: the planner
 * does not compute dates, it writes conditions that compute dates — that is what
 * {@code ConditionFn.DATE_PLUS} is for, and it runs deterministically, at no cost, every time
 * the check runs rather than once while it is being written. A tool nobody needs is a tool
 * that gets called anyway, and each call is a completion.
 */
@Component
public class PlannerTools {

    private final RuleCompiler rules;
    private final CheckCatalog catalog;
    private final ObjectMapper json;

    public PlannerTools(RuleCompiler rules, CheckCatalog catalog, ObjectMapper json) {
        this.rules = rules;
        this.catalog = catalog;
        this.json = json;
    }

    /** Everything the requirement reader may call. */
    public List<ToolSpec> forRequirements() {
        return List.of(checkCondition(), articleText());
    }

    /**
     * Whether a condition would be accepted, before it is committed to.
     *
     * <p>Answers the question the planner cannot answer for itself and the one that decides
     * whether the credit's demand costs nothing or costs a model call for ever. It is the
     * same validation the answer will face, so a condition this accepts is a condition that
     * compiles — there is no second opinion to disagree with.
     *
     * <p>It reports on <em>expressibility</em>, not on the presentation. Whether the invoice
     * actually shows the credit number is what running the check is for; whether "the invoice
     * shows the credit number" can be written as a comparison at all is what this settles,
     * and that answer is the same on every case, which is why it stays out of the cache key.
     */
    public ToolSpec checkCondition() {
        return new ToolSpec(
                "check_condition",
                """
                Check whether a condition you are drafting can actually be run, BEFORE you \
                return it. Pass the same {"groups": [...]} object you would put in `rule`. \
                Answers whether every operator, document and field in it is one this \
                examination knows — not whether the documents comply, which is what running \
                the check is for. A condition that does not pass here becomes a judged card \
                and costs a model call on every presentation, so it is worth fixing or \
                withdrawing while you can.""",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "rule", Map.of(
                                        "type", "object",
                                        "description", "the condition, as {\"groups\": [...]}")),
                        "required", List.of("rule")),
                args -> {
                    Object rule = args.get("rule");
                    if (rule == null) return "No condition was given.";
                    // A model that hands back the object as a JSON string rather than an
                    // object is not making a mistake worth a turn to correct.
                    if (rule instanceof String s) rule = parse(s);

                    RuleCompiler.Verdict v = rules.compile(rule);
                    if (v.ok()) {
                        ConditionTree.Parsed parsed = ConditionTree.parse(v.rule());
                        return "Accepted. It will run as an exact check"
                                + (parsed.ok() && parsed.tree().requiredVersion() > 1
                                        ? " (uses a computed value or the every-document form)." : ".");
                    }
                    return "Rejected — " + v.why()
                            + ". Fix it against the field list you were given, or leave `rule` "
                            + "null and let an examiner take it.";
                });
    }

    /**
     * The article behind a citation, in full.
     *
     * <p>A planner deciding whether {@code :47A:} displaces a standing rule is deciding
     * against an article, and asking it what it remembers of UCP 600 art. 29 is not the same
     * as showing it art. 29. Cheap and pure — the book does not change during a run.
     */
    public ToolSpec articleText() {
        return new ToolSpec(
                "article_text",
                """
                The full text of one UCP 600 or ISBP 821 article, by its citation — \
                "UCP600 Art.14", "ISBP821 A.corrections". Use it when a condition in the \
                credit turns on what an article actually says rather than on what it is \
                usually taken to say.""",
                Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "ref", Map.of("type", "string", "description", "the citation")),
                        "required", List.of("ref")),
                args -> {
                    String ref = args.get("ref") == null ? "" : String.valueOf(args.get("ref"));
                    String text = catalog.articleText(ref);
                    return text.isBlank()
                            ? "No article is filed under \"" + ref + "\"."
                            : text;
                });
    }

    private Object parse(String raw) {
        try {
            return json.readValue(raw, Object.class);
        } catch (Exception e) {
            return raw;
        }
    }
}
