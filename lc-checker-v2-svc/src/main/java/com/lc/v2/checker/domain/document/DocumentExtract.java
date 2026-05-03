package com.lc.v2.checker.domain.document;

import com.lc.v2.checker.domain.common.DocType;
import com.lc.v2.checker.domain.common.FieldEnvelope;
import java.util.List;
import java.util.Map;

/**
 * Merged extraction result for a single document type.
 * Holds one FieldEnvelope per extractor slot (primary / compare / benchmark)
 * plus the consensus-merged envelope used for rule evaluation.
 *
 * Confidence tiers:
 *   HIGH = all enabled slots agree
 *   MED  = primary + compare agree (benchmark differs)
 *   LOW  = disagreement between primary and compare
 */
public record DocumentExtract(
        DocType docType,
        FieldEnvelope consensus,
        Map<String, FieldEnvelope> bySlot,
        ExtractionConfidence overallConfidence,
        List<OffSchemaItem> offSchemaItems,
        String originalFileName,
        String fileSha256,
        int pageCount
) {
    public enum ExtractionConfidence { HIGH, MED, LOW }

    public boolean hasOffSchemaItem(String kind) {
        return offSchemaItems != null && offSchemaItems.stream().anyMatch(i -> kind.equals(i.kind()));
    }

    public boolean isSigned() {
        Object v = consensus.get("signed");
        return v != null && "true".equalsIgnoreCase(v.toString());
    }

    public boolean isStampPresent() {
        Object v = consensus.get("stamp_present");
        return v != null && "true".equalsIgnoreCase(v.toString());
    }

    public static DocumentExtract empty(DocType docType, String filename) {
        return new DocumentExtract(docType, FieldEnvelope.empty(), Map.of(),
                ExtractionConfidence.LOW, List.of(), filename, null, 0);
    }
}
