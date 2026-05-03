package com.lc.v2.checker.infra.fields;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.lc.v2.checker.domain.common.FieldType;
import java.util.List;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record ColumnDefinition(
        String key,
        String nameEn,
        String nameZh,
        FieldType type,
        List<String> invoiceAliases,
        List<String> enumValues,
        boolean ruleRelevant
) {

    public ColumnDefinition {
        invoiceAliases = invoiceAliases == null ? List.of() : List.copyOf(invoiceAliases);
        enumValues = enumValues == null ? List.of() : List.copyOf(enumValues);
    }
}
