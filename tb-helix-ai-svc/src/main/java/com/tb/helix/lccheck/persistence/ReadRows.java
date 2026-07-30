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
            int ordinal) {
    }

    /** One page of the bundle and what it was classified as. */
    public record BundlePage(int pageNo, String docCode, String label) {
    }

    /** A field read off a document. {@code valueNorm} is what rules compare. */
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

    /** {@code helix_check.lc_plan_check} — a check selected for this examination. */
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
            boolean addedByOfficer,
            String addedBy,
            String status,
            int ordinal) {
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
            String severity,
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

    /** The officer's verdict on a case, from {@code v_case_verdict}. */
    public record Verdict(String verdict, String note) {
    }

    /** The officer's latest call on one finding, from {@code v_finding_decision}. */
    public record Decision(String findingRef, String disposition, String note) {
    }
}
