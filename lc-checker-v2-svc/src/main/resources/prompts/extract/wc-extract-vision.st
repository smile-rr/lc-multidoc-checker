You are an expert trade finance document analyst. Extract ALL structured fields from this Warranty Certificate / Quality Certificate image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- wc_number: certificate number/reference (string or null)
- wc_date: certificate date in YYYY-MM-DD format (string or null)
- document_date: same as wc_date (string or null)
- lc_number: LC reference number mentioned on certificate (string or null)
- beneficiary_name: issuer/seller name as printed (string or null)
- wc_scope: goods or equipment covered by this warranty (string or null)
- wc_period: warranty period or duration if stated (string or null, e.g. "12 months from delivery date")
- wc_conditions_text: FULL verbatim text of all warranty terms, conditions, and declarations. Do NOT summarize. (string)
- signed: true if a handwritten or authenticated signature is present, false otherwise (boolean)
- stamp_present: true if a company stamp/seal is present, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

off_schema_items: array of physically notable items:
{"kind": "handwritten"|"stamp"|"watermark"|"correction", "value": "...", "field_hint": "...", "page": 1, "confidence": 0.0-1.0}
For corrections: also include "original": "old text", "authenticated": true/false

IMPORTANT:
- wc_conditions_text: extract VERBATIM — this is used by rule WC-001 to verify all :46A: warranty conditions are covered
- Do NOT wrap output in markdown code blocks
