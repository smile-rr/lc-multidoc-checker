package com.tb.helix.lccheck.stage.signoff;

import com.tb.helix.harness.llm.LlmGateway;
import com.tb.helix.harness.llm.LlmRole;
import com.tb.helix.harness.llm.text.PromptContext;
import com.tb.helix.harness.llm.text.TextRequest;
import com.tb.helix.harness.prompt.Prompts;
import com.tb.helix.infra.cache.CacheOp;
import com.tb.helix.infra.cache.DerivationCache;
import com.tb.helix.infra.cache.DerivationKey;
import com.tb.helix.lccheck.persistence.CaseRow;
import com.tb.helix.lccheck.persistence.ReadRows;
import com.tb.helix.lccheck.service.ModelSpend;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The words of a refusal advice, written from the grounds a person confirmed.
 *
 * <p>The last model call in the examination, and the only one that runs <b>after</b> a
 * decision rather than towards one. Until now field 77J was the finding's stored statement
 * concatenated, which is why an advice read like a database and not like a notice.
 *
 * <h2>It writes; it does not decide</h2>
 *
 * <p>The tempting version of a final agent reviews the findings and finalizes them —
 * resolving contradictions, merging duplicates, forming a view. Every one of those is a
 * decision, and this system's premise is that a person makes those: the machine's outcome is
 * never overwritten, an override is a second value beside it carrying a named person and a
 * time, and the Decision screen exists so somebody chooses. An agent that reviewed and
 * finalized would be that somebody, unaccountable and unsigned.
 *
 * <p>So the constraint is not a rule in the prompt, it is the shape of this class:
 * <b>it returns wording by finding ref, and the notice is assembled from the grounds.</b> A
 * ref it invented is never looked up. A ref it omitted falls back to the finding's own
 * statement. There is no path by which a ground reaches the notice that the officer did not
 * confirm, and none by which one they confirmed goes missing — which matters because art.
 * 16(c) gives one notice and art. 16(f) makes an omission final.
 *
 * <p>What it is given is the grounds and the credit's identifying terms, and nothing else
 * about the presentation. A drafter that could reach the facts could reach a ground nobody
 * signed.
 *
 * <p>Failure is not fatal by design. A provider that is down, a budget that is spent, JSON
 * that will not parse — all of them return an empty map, and every ground then reads exactly
 * as it did before this class existed. A notice must be able to go out.
 */
@Component
public class AdviceNarrator {

    private static final Logger log = LoggerFactory.getLogger(AdviceNarrator.class);

    private final LlmGateway models;
    private final DerivationCache cache;
    private final Prompts prompts;
    private final ObjectMapper json;
    private final boolean enabled;

    public AdviceNarrator(LlmGateway models, DerivationCache cache, Prompts prompts,
                          ObjectMapper json,
                          @Value("${helix.check.signoff.narrate:true}") boolean enabled) {
        this.models = models;
        this.cache = cache;
        this.prompts = prompts;
        this.json = json;
        this.enabled = enabled;
    }

    /**
     * The wording for each ground, by finding ref.
     *
     * @return an empty map when there is nothing to draft, when drafting is switched off, or
     *         when the call failed. The caller falls back per ground, so a partial answer is
     *         as usable as a whole one.
     */
    public Map<String, String> wordFor(String caseId, CaseRow credit, List<ReadRows.Finding> grounds) {
        if (!enabled || grounds.isEmpty()) return Map.of();

        PromptContext prompt = PromptContext.create()
                .stable("HOW TO DRAFT", prompts.get("advice-narrate"))
                .varying("THE CREDIT", identifying(credit))
                .varying("THE GROUNDS THE OFFICER CONFIRMED", describe(grounds));

        var key = new DerivationKey(CacheOp.NARRATE_ADVICE, CacheOp.NARRATE_ADVICE_V,
                prompt.volatileDigest(), "advice", prompt.digest(),
                models.identity(LlmRole.NARRATE), null, Map.of());

        try {
            var hit = cache.computeIfAbsent(key, Map.class, () -> {
                var result = models.complete(TextRequest.json(
                        LlmRole.NARRATE, prompts.get("advice-narrate"), prompt.render()));
                return new DerivationCache.Entry<>(parse(result.content()), null,
                        result.rawResponse(), ModelSpend.of(result.usage(), result.model()));
            });
            @SuppressWarnings("unchecked")
            Map<String, Object> answer = (Map<String, Object>) hit.value();
            return byRef(answer);
        } catch (RuntimeException e) {
            // The notice still goes out, in the wording the examination already produced.
            // Refusing to advise because a drafter was unavailable would turn a cosmetic
            // dependency into an operational one, on the one act that has a deadline.
            log.warn("Could not draft the advice for {}: {} — the findings' own statements stand",
                    caseId, e.toString());
            return Map.of();
        }
    }

    /** Enough to name the credit, and nothing that could be examined. */
    private static String identifying(CaseRow c) {
        StringBuilder sb = new StringBuilder();
        line(sb, "credit reference", c.creditRef());
        line(sb, "our reference", c.caseRef());
        line(sb, "applicant", c.applicant());
        line(sb, "beneficiary", c.beneficiary());
        line(sb, "currency and amount",
                c.currency() == null ? null : c.currency() + " " + c.amount());
        line(sb, "presented by", c.presentingBank());
        return sb.toString();
    }

    /**
     * One ground, as the officer left it.
     *
     * <p>The officer's own note last and marked as theirs: where it says something the
     * finding does not, it is the more recent view of the person who signs, and the prompt
     * says it governs.
     */
    private static String describe(List<ReadRows.Finding> grounds) {
        StringBuilder sb = new StringBuilder();
        for (ReadRows.Finding g : grounds) {
            sb.append("  ").append(g.findingRef()).append('\n');
            line(sb, "  about", g.title());
            line(sb, "  as it stands", g.statement());
            line(sb, "  the credit requires", g.expected());
            line(sb, "  the documents show", g.quote());
            line(sb, "  document", g.docCode());
            line(sb, "  cites", g.checkId());
            line(sb, "  the officer noted", g.reason());
            sb.append('\n');
        }
        return sb.toString();
    }

    private static void line(StringBuilder sb, String label, Object value) {
        if (value == null || String.valueOf(value).isBlank()) return;
        sb.append("  ").append(label).append(": ")
          .append(String.valueOf(value).replaceAll("\\s+", " ").strip()).append('\n');
    }

    /** {@code grounds: [{findingRef, statement}]} to a lookup, dropping anything unusable. */
    private static Map<String, String> byRef(Map<String, Object> answer) {
        Map<String, String> out = new LinkedHashMap<>();
        if (!(answer.get("grounds") instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Object ref = m.get("findingRef");
            Object statement = m.get("statement");
            if (ref == null || statement == null) continue;
            String text = String.valueOf(statement).replaceAll("\\s+", " ").strip();
            if (!text.isBlank()) out.put(String.valueOf(ref), text);
        }
        return out;
    }

    private Map<String, Object> parse(String content) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = json.readValue(content, Map.class);
            return m;
        } catch (Exception e) {
            throw new IllegalStateException("the drafter's answer was not JSON", e);
        }
    }
}
