package com.tb.helix.lccheck.rule;

import com.tb.helix.governance.types.ExpressionRule;
import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.LlmText;
import com.tb.helix.harness.llm.tool.ToolRequest;
import com.tb.helix.harness.llm.tool.ToolResult;
import com.tb.helix.harness.llm.tool.ToolSpec;
import com.tb.helix.harness.prompt.Prompts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Asking an examiner the questions a comparison cannot settle.
 *
 * <h2>It answers conditions; it does not decide checks</h2>
 *
 * <p>This is the whole of the contract and everything else follows from it. The model is given
 * a list of questions with ids and returns true / false / unknown for each; the outcome is
 * worked out from those answers by {@link ExpressionRule#decide}, which is the same walk an
 * expression check uses. So:
 *
 * <ul>
 *   <li>an agent check and an expression check cannot come to mean different things, because
 *       there is one walk;
 *   <li>every answer is recorded against the question it answered, so a finding says which
 *       question was asked and what was said — not merely that a model concluded something;
 *   <li>a garbled reply degrades to unknown, and an unanswered condition stops the table at
 *       doubt. <b>A bad response cannot produce a discrepancy.</b>
 * </ul>
 *
 * <h2>One call, all the questions, tools in parallel</h2>
 *
 * <p>Every question for one examiner goes in one request. The model may ask for any number of
 * {@code settle} calls in a single turn; they are run at once and every result comes back in
 * the next completion. So the ordinary shape is <b>two completions</b> — ask, then answer —
 * and the budget caps it at {@code helix.check.agent.max-iterations}.
 *
 * <p><b>A spent budget is not a conclusion.</b> When the loop ends on its budget it carries no
 * answer, and every question is left unknown rather than assumed. Reading a partial
 * conversation as a verdict is how an unfinished check comes to look like a passing one.
 */
@Component
public class ConditionAsker {

    private static final Logger log = LoggerFactory.getLogger(ConditionAsker.class);

    private final LlmGateway llm;
    private final Prompts prompts;
    private final ObjectMapper json;
    private final int maxIterations;

    public ConditionAsker(LlmGateway llm, Prompts prompts, ObjectMapper json,
                          @Value("${helix.check.agent.max-iterations:3}") int maxIterations) {
        this.llm = llm;
        this.prompts = prompts;
        this.json = json;
        this.maxIterations = Math.max(1, maxIterations);
    }

    /**
     * One question put to an examiner.
     *
     * @param id    stable within the request, so an answer can be matched back to what it
     *              answered rather than to a position in a list the model may reorder
     * @param check which check it belongs to, for the finding
     * @param ask   the question as the author wrote it
     */
    public record Question(String id, String checkId, int branch, String ask) {
    }

    /**
     * @param answer  what the examiner said
     * @param because one sentence naming what was read. Shown to the officer beside the
     *                question, so it is evidence rather than commentary.
     */
    public record Answered(ExpressionRule.Answer answer, String because) {
    }

    /**
     * @param answers    by question id. A question with no entry was not answered and is
     *                   unknown — never assumed either way.
     * @param toolCalls  every {@code settle} the examiner made, so a conclusion reached by
     *                   computing a date difference is auditable.
     * @param exhausted  the budget ended it, so nothing here is a conclusion
     */
    public record Answers(Map<String, Answered> answers, List<ToolSpec.Call> toolCalls,
                          boolean exhausted, String model) {

        public ExpressionRule.Answer of(String id) {
            Answered a = answers.get(id);
            return a == null ? ExpressionRule.Answer.UNKNOWN : a.answer();
        }

        public String because(String id) {
            Answered a = answers.get(id);
            return a == null ? "The examiner did not answer this." : a.because();
        }

        static Answers none(String why) {
            return new Answers(Map.of(), List.of(), true, null);
        }

        /** Nothing to ask, which is not the same as nothing answered. */
        public static Answers none() {
            return new Answers(Map.of(), List.of(), false, null);
        }

        /**
         * What is worth keeping in the derivation cache: what was said about each condition.
         *
         * <p>Not the conversation. A cached transcript would be a shape that changes whenever
         * the tool loop does, and every stored entry would have to be re-read by whichever
         * version happened to load it.
         */
        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            answers.forEach((id, a) -> out.put(id, Map.of(
                    "answer", a.answer().name(),
                    "because", a.because() == null ? "" : a.because())));
            return out;
        }

        @SuppressWarnings("unchecked")
        public static Answers fromMap(Map<String, Object> stored) {
            Map<String, Answered> out = new LinkedHashMap<>();
            stored.forEach((id, v) -> {
                if (!(v instanceof Map<?, ?> m)) return;
                ExpressionRule.Answer a = answerOf(String.valueOf(((Map<String, Object>) m).get("answer")));
                if (a == null) return;
                Object why = ((Map<String, Object>) m).get("because");
                out.put(id, new Answered(a, why == null || String.valueOf(why).isBlank()
                        ? null : String.valueOf(why)));
            });
            return new Answers(out, List.of(), false, null);
        }
    }

    /**
     * @param presentation the shared fact sheet and whatever else the remit is given, already
     *                     rendered. Built by the caller because what an examiner reads is the
     *                     caller's decision, not this one's.
     * @param remit        the examiner's own instruction, or null where no agent claims it
     * @param settle       the tool, bound to this case's facts
     */
    public Answers ask(List<Question> questions, String presentation, String remit,
                       ToolSpec settle) {
        if (questions.isEmpty()) return new Answers(Map.of(), List.of(), false, null);
        StringBuilder user = new StringBuilder(presentation == null ? "" : presentation);
        if (remit != null && !remit.isBlank()) {
            user.append("\n\nYOUR REMIT\n\n").append(remit);
        }
        return ask(questions, user + "\n\n" + conditions(questions), settle);
    }

    /** The conditions block, so a caller assembling its own prompt puts it where it belongs. */
    public static String conditions(List<Question> questions) {
        StringBuilder sb = new StringBuilder();
        for (Question q : questions) {
            sb.append(q.id()).append("  ").append(q.ask()).append('\n');
        }
        return sb.toString();
    }

    /**
     * The call itself, given a prompt somebody else assembled.
     *
     * <p>Used by the examination, which builds its prompt through {@code PromptContext} so the
     * stable and shared blocks come first and every examiner rides one warmed prefix. Passing
     * it the pieces and letting this concatenate them would put a per-remit block above the
     * shared one, and the first-group-alone warming would become pure latency for no saving.
     */
    public Answers ask(List<Question> questions, String user, ToolSpec settle) {
        if (questions.isEmpty()) return new Answers(Map.of(), List.of(), false, null);

        ToolResult result;
        try {
            result = llm.loop(new ToolRequest(LlmRole.JUDGE, prompts.get("agent-conditions"),
                    user, List.of(settle), maxIterations, Map.of()));
        } catch (RuntimeException e) {
            // A call that failed is not an answer. Every question stays unknown, the table
            // stops at doubt, and the officer is told rather than shown a guess.
            log.warn("Examiner call failed for {} condition(s): {}", questions.size(), e.toString());
            return Answers.none(e.getMessage());
        }

        if (!result.concluded()) {
            log.warn("Examiner returned no answer for {} condition(s) after {} iteration(s){}",
                    questions.size(), result.iterations(),
                    result.budgetSpent() ? " — budget spent" : "");
            return new Answers(Map.of(), result.toolCalls(), true, result.model());
        }
        return new Answers(parse(result.content()), result.toolCalls(), false, result.model());
    }

    /**
     * The reply, read defensively.
     *
     * <p>Anything unreadable leaves the question unanswered, which is unknown, which stops the
     * table at doubt. That is the safe direction and it is the only one: a parser that guessed
     * at a malformed answer would be inventing an examination.
     */
    private Map<String, Answered> parse(String content) {
        Map<String, Answered> out = new LinkedHashMap<>();
        try {
            // The same salvage every structured reply goes through — a model that wrapped its
            // JSON in prose or a fence is not a model that failed to answer.
            JsonNode root = json.readTree(LlmText.extractJson(content));
            for (JsonNode node : root.isArray() ? root : List.of(root)) {
                String id = node.path("id").asText(null);
                ExpressionRule.Answer answer = answerOf(node.path("answer").asText(null));
                if (id == null || answer == null) continue;
                String because = node.path("because").asText("");
                out.put(id, new Answered(answer, because.isBlank() ? null : because));
            }
        } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Examiner reply could not be read as answers: {}", e.toString());
        }
        return out;
    }

    /** Anything that is not one of the three words is not an answer. */
    private static ExpressionRule.Answer answerOf(String word) {
        if (word == null) return null;
        return switch (word.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "true", "yes" -> ExpressionRule.Answer.TRUE;
            case "false", "no" -> ExpressionRule.Answer.FALSE;
            case "unknown", "unsure", "cannot say" -> ExpressionRule.Answer.UNKNOWN;
            default -> null;
        };
    }

    /** The questions a table still needs answered, given what the engine already settled. */
    public static List<Question> pending(String checkId, ExpressionRule rule,
                                         java.util.function.IntFunction<ExpressionRule.Answer> settle) {
        List<Question> out = new ArrayList<>();
        for (int i : rule.pending(settle)) {
            out.add(new Question(checkId.toLowerCase(java.util.Locale.ROOT) + "-c" + (i + 1),
                    checkId, i, rule.branches().get(i).ask()));
        }
        return out;
    }
}
