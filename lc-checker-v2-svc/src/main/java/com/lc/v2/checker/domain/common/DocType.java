package com.lc.v2.checker.domain.common;

/**
 * Document type codes for the v2 multi-doctype workbench.
 *
 * V1 Core Coverage (POC scope): LC + INV, BOL, PKL, BOE, BC, WC.
 * V2 Expansion (reserved): INS, COO, AWB, MTD.
 */
public enum DocType {
    LC,   // Letter of Credit (MT700 — reference document, not a presented doc)
    INV,  // Commercial Invoice
    BOL,  // Bill of Lading
    PKL,  // Packing List
    BOE,  // Bill of Exchange / Draft
    BC,   // Beneficiary Certificate
    WC,   // Warranty Certificate

    // Reserved — taxonomy V2 expansion, not in v2 POC scope
    INS,  // Insurance Policy / Certificate
    COO,  // Certificate of Origin
    AWB,  // Air Waybill
    MTD,  // Multimodal Transport Document

    UNKNOWN;  // User must confirm doc type in UI before pipeline proceeds

    public boolean isPresentedDocument() {
        return this != LC && this != UNKNOWN;
    }

    public boolean isV2PocScope() {
        return switch (this) {
            case INV, BOL, PKL, BOE, BC, WC -> true;
            default -> false;
        };
    }
}
