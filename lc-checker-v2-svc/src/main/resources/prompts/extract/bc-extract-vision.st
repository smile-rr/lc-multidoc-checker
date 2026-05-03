You are an expert trade finance document analyst. Extract ALL structured fields from this Beneficiary Certificate image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- bc_number: certificate number/reference (string or null)
- bc_date: certificate date in YYYY-MM-DD format (string or null)
- document_date: same as bc_date (string or null)
- lc_number: LC reference number mentioned on certificate (string or null)
- beneficiary_name: beneficiary/issuer name as printed (string or null)
- bc_certifying_party: the entity making the certification (if different from beneficiary) (string or null)
- bc_conditions_text: FULL verbatim text of all conditions and certifications stated in the document. Do NOT summarize — copy the complete text. (string)
- signed: true if a handwritten or authenticated signature is present, false otherwise (boolean)
- stamp_present: true if a company stamp/seal is present, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

off_schema_items: array of physically notable items:
{"kind": "handwritten"|"stamp"|"watermark"|"correction", "value": "...", "field_hint": "...", "page": 1, "confidence": 0.0-1.0}
For corrections: also include "original": "old text", "authenticated": true/false

IMPORTANT:
- bc_conditions_text: extract VERBATIM — this is critical for rule BC-001 which checks that all :46A: conditions are covered
- signed: per ISBP Q3, a company stamp alone is NOT a signature — signed=true requires visible handwritten or authenticated digital signature by the beneficiary
- Do NOT wrap output in markdown code blocks
