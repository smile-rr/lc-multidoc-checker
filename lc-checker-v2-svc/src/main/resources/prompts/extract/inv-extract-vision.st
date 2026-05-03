You are an expert trade finance document analyst. Extract ALL structured fields from this Commercial Invoice image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- lc_number: LC reference number mentioned on the invoice (string or null)
- invoice_number: invoice number/reference (string)
- invoice_date: invoice issue date in YYYY-MM-DD format (string or null)
- document_date: same as invoice_date if not separately stated (string or null)
- beneficiary_name: seller/exporter name exactly as printed (string)
- beneficiary_address: seller/exporter address (string or null)
- applicant_name: buyer/importer/consignee name (string or null)
- applicant_address: buyer address (string or null)
- credit_currency: 3-letter ISO currency code (e.g. USD, EUR, CNY)
- invoice_total: total invoice amount as number (no currency symbol)
- quantity: total goods quantity with unit (string, e.g. "500 MT" or "200 SETS")
- unit: unit of measure (string, e.g. MT, KGS, SETS, PCS)
- unit_price: unit price as number
- goods_description: full goods description verbatim (string)
- incoterms: Incoterms term found in description (CIF/FOB/CFR/EXW/FCA/CPT/CIP/DAP/DPU/DDP or null)
- country_of_origin: country of origin if stated (string or null)
- port_of_loading: port of loading if stated (string or null)
- port_of_discharge: port of discharge if stated (string or null)
- signed: true if a handwritten or authenticated signature is visible, false otherwise (boolean)
- stamp_present: true if a company stamp/seal is visible, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, SPECIMEN, DUPLICATE, or null

off_schema_items: array of physically notable items found on the document not captured in fields above.
Each item: {"kind": "handwritten"|"stamp"|"watermark"|"correction", "value": "...", "field_hint": "...", "page": 1, "confidence": 0.0-1.0}
- "handwritten": any handwritten annotation (field_hint = which field it relates to)
- "stamp": ink stamps/seals (value = stamp text or description)
- "watermark": watermark text (ORIGINAL, COPY, etc.)
- "correction": any struck-through or corrected text (include "original" and "authenticated" fields)

For corrections also include: "original": "old text", "authenticated": true/false

IMPORTANT:
- Extract EXACTLY what is printed — do not paraphrase or infer
- If a field is not present on the document, use null
- invoice_total must be a number (e.g. 125000.00), not a string
- Do NOT wrap output in markdown code blocks
