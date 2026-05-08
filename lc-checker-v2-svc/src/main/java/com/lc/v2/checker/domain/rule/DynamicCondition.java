package com.lc.v2.checker.domain.rule;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import java.util.List;

/**
 * One atomic LC :47A: free-text condition emitted by the {@code COND-DYN}
 * decomposer (see {@code docs/architecture/rule-set.md} §3 and
 * {@code production-readiness.md} §6).
 *
 * <p>One :47A: clause typically yields one condition; a multi-statement clause
 * may yield several. Each condition becomes an inline AGENT check executed
 * against its target documents during Examine.
 *
 * <p>Caching: the entire {@code List<DynamicCondition>} for a session is keyed
 * on a content hash of the LC :47A: text in {@code pipeline_steps}, so re-runs
 * of the same LC reuse the decomposition (no re-LLM cost).
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record DynamicCondition(
        /** Stable per-condition id (sha-256 prefix of source_text). */
        String id,
        /** Verbatim :47A: clause that this condition is derived from. */
        String sourceText,
        /** Target doc types the condition bears on (e.g. [INV], [BOL, INV]). */
        List<String> appliesToDocs,
        /** POS = condition asserts something must be present/true.
         *  NEG = condition asserts something must be absent/false. */
        String polarity,
        /** Model-suggested severity; officer-reviewable. */
        String severity,
        /** UCP article ids the condition cites (may be empty for novel clauses). */
        List<String> ucpRefs,
        /** ISBP paragraph ids the condition cites (may be empty). */
        List<String> isbpRefs,
        /** ASSERT_PRESENT | ASSERT_EQUALS | ASSERT_FORMAT | ASSERT_ABSENT | OUT_OF_SCOPE. */
        String checkKind,
        /** Templated check prompt — combines source_text with target-doc evidence shape.
         *  Fed to AgentRuleExecutor as the per-condition rule's prompt_instruction. */
        String checkPrompt
) {
    public DynamicCondition {
        appliesToDocs = appliesToDocs == null ? List.of() : List.copyOf(appliesToDocs);
        ucpRefs = ucpRefs == null ? List.of() : List.copyOf(ucpRefs);
        isbpRefs = isbpRefs == null ? List.of() : List.copyOf(isbpRefs);
    }

    public boolean isOutOfScope() {
        return "OUT_OF_SCOPE".equals(checkKind);
    }

    /** Synthetic rule_id under which the condition appears in pipeline_steps + UI. */
    public String synthRuleId() {
        return "DYN-" + (id == null ? "00000000" : id.substring(0, Math.min(8, id.length())));
    }
}
