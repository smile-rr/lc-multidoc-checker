package com.lc.v2.checker.domain.lc;

import com.lc.v2.checker.domain.common.FieldEnvelope;
import com.lc.v2.checker.domain.common.ParsedRow;
import java.util.List;
import java.util.Map;

/**
 * Result of MT700 parse + LC self-consistency check.
 * All LC fields are in the envelope — no typed scalar accessors.
 */
public record LcParseResult(
        FieldEnvelope envelope,
        String rawMt700,
        Map<String, String> rawFields,
        List<LcConsistencyWarning> consistencyWarnings,
        List<ParsedRow> parsedRows,
        LcDerived derived
) {

    public LcParseResult(FieldEnvelope envelope, String rawMt700, Map<String, String> rawFields,
                         List<LcConsistencyWarning> consistencyWarnings, List<ParsedRow> parsedRows) {
        this(envelope, rawMt700, rawFields, consistencyWarnings, parsedRows, null);
    }

    public LcParseResult {
        rawFields = rawFields == null ? Map.of() : Map.copyOf(rawFields);
        consistencyWarnings = consistencyWarnings == null ? List.of() : List.copyOf(consistencyWarnings);
        parsedRows = parsedRows == null ? List.of() : List.copyOf(parsedRows);
    }

    public String getLcNumber() { return envelope.getString("lc_number"); }
    public String getBeneficiaryName() { return envelope.getString("beneficiary_name"); }
    public String getApplicantName() { return envelope.getString("applicant_name"); }
    public boolean hasConsistencyWarnings() { return !consistencyWarnings.isEmpty(); }

    public LcParseResult withDerived(LcDerived newDerived) {
        return new LcParseResult(envelope, rawMt700, rawFields,
                consistencyWarnings, parsedRows, newDerived);
    }
}
