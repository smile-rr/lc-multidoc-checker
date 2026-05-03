package com.lc.v2.checker.infra.fields;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.lc.v2.checker.domain.common.ParserType;
import java.util.List;
import java.util.Map;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record TagMapping(
        String tag,
        List<String> fieldKeys,
        ParserType parser,
        boolean mandatory,
        Map<String, Object> defaults,
        Validation validation
) {

    public TagMapping {
        fieldKeys = fieldKeys == null ? List.of() : List.copyOf(fieldKeys);
        defaults = defaults == null ? Map.of() : Map.copyOf(defaults);
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Validation(String pattern, Integer maxLength, Integer minLength) {}
}
