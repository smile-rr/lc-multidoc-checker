package com.lc.v2.checker.infra.fields;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.lc.v2.checker.domain.common.FieldType;
import java.util.List;

/**
 * One row of field-pool.yaml.
 * applies_to: subset of [LC, INV, BOL, PKL, BOE, BC, WC] — matches DocType.name() values.
 * reconcile_canonical: true → field participates in Reconcile stage pivot.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record FieldDefinition(
        String key,
        String nameEn,
        String nameZh,
        FieldType type,
        String descriptionZh,
        List<String> appliesTo,
        List<String> sourceTags,
        List<String> invoiceAliases,
        List<String> enumValues,
        boolean ruleRelevant,
        boolean reconcileCanonical,
        Object defaultValue,
        String group,
        List<ColumnDefinition> columns,
        String extractionHint,
        List<String> ucpRefs,
        List<String> isbpRefs
) {

    public FieldDefinition {
        appliesTo = appliesTo == null ? List.of() : List.copyOf(appliesTo);
        sourceTags = sourceTags == null ? List.of() : List.copyOf(sourceTags);
        invoiceAliases = invoiceAliases == null ? List.of() : List.copyOf(invoiceAliases);
        enumValues = enumValues == null ? List.of() : List.copyOf(enumValues);
        columns = columns == null ? List.of() : List.copyOf(columns);
        ucpRefs = ucpRefs == null ? List.of() : List.copyOf(ucpRefs);
        isbpRefs = isbpRefs == null ? List.of() : List.copyOf(isbpRefs);
    }

    public boolean appliesToLc() {
        return appliesTo.contains("LC");
    }

    /** True if this field applies to the given doc type (by its enum name, e.g. "INV", "BOL"). */
    public boolean appliesToDoc(String docTypeCode) {
        return appliesTo.contains(docTypeCode);
    }
}
