package com.tb.helix.lccheck.persistence;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One row of {@code helix_check.lc_case}.
 *
 * <p>The schema, named once. Before this the store returned {@code Map<String, Object>} and
 * eighty-five snake_case column names were spelled out across stages, the pipeline and the
 * assembler — so renaming a column compiled cleanly and failed at runtime, in a file nowhere
 * near the migration that caused it. Every one of those names now appears here and nowhere
 * else.
 *
 * <p><b>A row is not a domain type.</b> It has a column per field, in the database's
 * vocabulary and the database's nullability, and it stops at the store's edge — the service
 * turns it into {@code CaseDetail}, which is what the rest of the system reads. Passing this
 * outward would make the wire format track the schema, which is the coupling the split
 * exists to prevent. {@code ArchitectureTest.rowsDoNotEscapeThePersistencePackage} enforces
 * that; it is the rule that could not be written while these were maps.
 *
 * <p>Nullability is the schema's, not wishful: {@code expiry} is null until the credit has
 * been read, and a stage that forgets is a compiler warning away from knowing.
 */
public record CaseRow(
        String id,
        String caseRef,
        String status,
        String stage,
        String nextStage,
        boolean awaitingOfficer,

        // --- Credit terms, denormalised so the cases list is one query ---
        String creditRef,
        LocalDate issuedDate,
        String applicant,
        String beneficiary,
        String currency,
        BigDecimal amount,
        BigDecimal tolerancePct,
        LocalDate latestShipment,
        LocalDate expiry,
        String expiryPlace,
        Integer presentationDays,
        String tenor,
        String goods,

        // --- What we hold ---
        String creditTextSha,
        String sourceBundleSha,
        String bundlePdfSha,
        int pageCount,

        // --- The presentation ---
        LocalDate presentedDate,
        String presentingBank,
        LocalDate replyDueDate,
        String assignedTo,
        String authoriser,

        // --- The gate ---
        boolean gateHalted,
        String gateHaltCheckId,
        String gateOverriddenBy,

        String error) {

    /** Whether a hard check stopped this examination and nobody has overridden it. */
    public boolean halted() {
        return gateHalted && gateOverriddenBy == null;
    }
}
