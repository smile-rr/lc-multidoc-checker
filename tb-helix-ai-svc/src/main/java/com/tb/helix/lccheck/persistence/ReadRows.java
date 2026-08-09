package com.tb.helix.lccheck.persistence;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The shapes the store hands back, other than {@link CaseRow}.
 *
 * <p>One file rather than six, because these are read together — the workbench asks for a
 * case and gets all of them — and six files holding one record each would be navigation for
 * its own sake. {@code CaseRow} is separate because it is read on its own by every stage.
 *
 * <p>Each carries only the columns its query selects, so what a query returns and what the
 * caller can reach are the same thing. Where a query selects fewer columns than the table
 * has, that is deliberate: {@link Fact} does not carry {@code corrected_by} because the
 * screens do not show it yet, and a record that promised the column would be lying.
 *
 * <p>Composite values stay as their JDBC shapes — {@code jsonb} arrives as a String, an
 * {@code INT[]} as a {@code List<Integer>} once the store has unwrapped it. Parsing them
 * into anything richer belongs to the assembler, not the row.
 */
public final class ReadRows {

    private ReadRows() {
    }

    /** {@code helix_check.lc_document}. */
    public record Document(
            String docCode,
            String role,
            String docTypeLabel,
            String abbr,
            String icon,
            String fileName,
            String reference,
            List<Integer> pages,
            String extractionMode,
            boolean lowConfidence,
            String scanNote,
            String layoutMd,
            /** Whether the attest pass has looked at this document. False is not "clean" —
             *  it is "not looked at", and the two must not render the same. */
            boolean attested,
            int ordinal) {
    }

    /** One page of the bundle and what it was classified as. */
    public record BundlePage(int pageNo, String docCode, String label) {
    }

    /**
     * A field read off a document.
     *
     * <p>{@code value} is what rules compare and what an officer reads — the operator parses
     * it, because reading an amount and reading a date are different jobs. {@code valueNorm}
     * is an upper-cased copy and is <em>not</em> the comparison source, whatever the column
     * comment said for its first year.
     */
    public record Fact(
            String docCode,
            String label,
            String fieldKey,
            String value,
            String valueNorm,
            Integer page,
            String anchorId,
            String source,
            String sourceText,
            String confidence,
            String flag) {
    }

    /**
     * Something on the page that is not text — a signature, a chop, an initialled correction.
     *
     * <p>The evidence behind an attestation fact. {@code legible} false with {@code readsAs}
     * null is the one combination that carries a whole argument: the mark is there and
     * cannot be read, which is not the same as its absence and is not a discrepancy.
     *
     * @param capacity      'as agent for XYZ Lines, the carrier'. UCP 600 art. 20(a)(i) is
     *                      not satisfied by a signature that does not say this.
     * @param authenticates what this mark exists to authenticate, when it does — a
     *                      correction, an added on-board notation. Null for a mark standing
     *                      on its own.
     */
    public record Mark(
            String docCode,
            String kind,
            Integer page,
            String placement,
            String readsAs,
            String party,
            String capacity,
            String medium,
            String authenticates,
            boolean legible,
            String confidence) {
    }

    /**
     * {@code helix_check.lc_plan_check} — a check selected for this examination.
     *
     * @param coverage          how well this can be settled at all: {@code DETERMINISTIC},
     *                          {@code SEMI_DETERMINISTIC} or {@code HUMAN}. Written from the
     *                          check's own tier, so it cannot drift from it.
     * @param suppressedBecause the credit's clause that stood a standing rule down, if one
     *                          did. Non-null is the difference between "the trigger was not
     *                          met" and "the planner read :47A: and set this aside" — both
     *                          are SKIPPED, and only one of them has to be defended later.
     */
    public record PlanCheck(
            String checkId,
            String origin,
            String tier,
            String checkType,
            boolean isGate,
            String citedAs,
            String areaId,
            String name,
            String appliesBecause,
            String ruleRef,
            String severity,
            List<String> refs,
            String ruleDef,
            String executionPlan,
            boolean notCovered,
            boolean plannedByLlm,
            boolean addedByOfficer,
            String addedBy,
            String status,
            String coverage,
            String suppressedBecause,
            /** The requirement card whose condition replaced one of this check's rows. */
            String variedBy,
            /** The credit's own words for the variation. Never null when {@code variedBy} is set. */
            String variedQuote,
            /** The row this check carried before the credit varied it, as stored. */
            String variedFrom,
            /** Set on a requirement folded into a standing check: it ran under that id. */
            String mergedInto,
            List<String> docCodes,
            int ordinal) {

        /** Whether this is one nothing can settle but a person. */
        public boolean human() {
            return "HUMAN".equals(coverage);
        }
    }

    /**
     * A finding, with the four columns its check contributes.
     *
     * <p>{@code origin}, {@code tier}, {@code checkType} and {@code citedAs} are joined from
     * {@code lc_plan_check} rather than copied onto the finding — a finding that carried its
     * own copy would drift from the check that produced it.
     */
    public record Finding(
            String findingRef,
            String outcome,
            String outcomeReason,
            String area,
            String areaId,
            String docCode,
            Integer page,
            String anchorId,
            String creditAnchorId,
            String title,
            String statement,
            String statementSource,
            String detail,
            String expected,
            String quote,
            String quoteSource,
            String reason,
            String analysis,
            /** The settled rows, as jsonb. Written since exact checks existed, read by
             *  nobody until the review screen was given them. */
            String comparison,
            boolean raisedByOfficer,
            String checkId,
            String origin,
            String tier,
            String checkType,
            String citedAs) {
    }

    /** What one step of a run cost. Read by the cost drawer and the spend panel. */
    public record RunStep(
            String stepId,
            String stage,
            String kind,
            String name,
            String role,
            String modelId,
            int checksCount,
            int totalCalls,
            int cachedCalls,
            BigDecimal seconds,
            int tokensIn,
            int tokensOut,
            int retries,
            String note,
            int ordinal) {

        /** The wire shape the cost drawer reads. Named here so the column names stop here. */
        public Map<String, Object> asView() {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", stepId);
            m.put("stage", stage);
            m.put("kind", kind);
            m.put("name", name);
            m.put("role", role);
            m.put("model", modelId);
            m.put("checks", checksCount);
            m.put("calls", totalCalls);
            m.put("cachedCalls", cachedCalls);
            m.put("seconds", seconds);
            m.put("tokensIn", tokensIn);
            m.put("tokensOut", tokensOut);
            m.put("retries", retries);
            m.put("note", note);
            return m;
        }
    }

    /**
     * {@code v_case_summary} — the cases list, in one query.
     *
     * <p>A view rather than a table, and that is the pattern this codebase reaches for
     * first: the counting and the reply-due arithmetic are SQL, versioned in a migration and
     * runnable in any DB tool, rather than a fan-out of queries assembled in Java.
     */
    public record CaseSummary(
            String caseRef,
            String status,
            String creditRef,
            String beneficiary,
            String currency,
            BigDecimal amount,
            int pageCount,
            Integer replyDueDays) {
    }

    /**
     * Where the officer put the presentation, from {@code v_case_verdict}.
     *
     * <p>{@code status} is null until somebody settles one — the derived value is not stored,
     * because it moves whenever an override does.
     */
    public record Verdict(String status, String note) {
    }

    /**
     * The officer overruling the engine on one finding, from {@code v_finding_override}.
     *
     * <p>Only findings somebody disagreed about appear. An absent row is not a missing
     * decision — it is the engine's own outcome standing, which is the ordinary case.
     */
    public record Override(String findingRef, String outcome, String note, String by, String at) {
    }
}
