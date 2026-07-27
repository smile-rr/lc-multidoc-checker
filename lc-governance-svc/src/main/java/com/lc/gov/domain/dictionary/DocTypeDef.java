package com.lc.gov.domain.dictionary;

/** A document type a check can apply to — LC, INV, BOL, PKL, BOE, BC, WC. */
public record DocTypeDef(
        String code,
        String nameEn,
        String nameZh,
        String description,
        int ordinal) {}
