package com.lc.gov.api.dto;

import com.lc.gov.domain.dictionary.DictField;
import com.lc.gov.domain.dictionary.DocTypeDef;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

/** Request bodies for hand-editing the Dictionary, one entry at a time. */
public final class DictionaryDtos {

    private DictionaryDtos() {}

    public record FieldRequest(
            @NotBlank String key,
            @NotBlank String nameEn,
            String nameZh,
            String kind,
            String valueType,
            String fieldGroup,
            List<String> sourceTags,
            List<String> appliesTo,
            Boolean ruleRelevant,
            String description) {

        public DictField toDomain() {
            return new DictField(
                    key.trim(), nameEn.trim(), nameZh,
                    kind == null || kind.isBlank() ? DictField.LC_FIELD : kind.trim().toUpperCase(),
                    valueType, fieldGroup,
                    sourceTags == null ? List.of() : sourceTags,
                    appliesTo == null ? List.of() : appliesTo,
                    ruleRelevant == null || ruleRelevant,
                    description,
                    false);
        }
    }

    public record DocTypeRequest(
            @NotBlank String code,
            @NotBlank String nameEn,
            String nameZh,
            String description,
            Integer ordinal) {

        public DocTypeDef toDomain() {
            return new DocTypeDef(
                    code.trim().toUpperCase(), nameEn.trim(), nameZh, description,
                    ordinal == null ? 0 : ordinal);
        }
    }
}
