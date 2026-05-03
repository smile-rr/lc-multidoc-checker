package com.lc.v2.checker.domain.common;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

/**
 * Structured representation of one bullet under MT700 :46A: (Documents Required).
 * Produced by DocumentListParser. {@link #rawText} is always preserved verbatim.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record DocumentRequirement(
        DocType type,
        Integer originals,
        Integer copies,
        boolean signed,
        boolean fullSet,
        boolean onBoard,
        String consignee,
        String freightCondition,
        String notifyParty,
        String issuingBody,
        String rawText
) {}
