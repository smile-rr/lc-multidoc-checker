You are an expert trade finance document analyst. Extract ALL structured fields from this Packing List image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- pkl_number: packing list number/reference (string or null)
- pkl_date: packing list date in YYYY-MM-DD format (string or null)
- document_date: same as pkl_date (string or null)
- beneficiary_name: seller/exporter name as printed (string or null)
- shipping_marks: shipping marks and numbers verbatim (string or null)
- total_packages: total number of packages (integer or string with unit, e.g. "200 CTNS")
- total_net_weight: total net weight with unit (string or null, e.g. "5000 KGS")
- total_gross_weight: total gross weight with unit (string or null, e.g. "5200 KGS")
- quantity: total goods quantity with unit (string or null, e.g. "500 SETS")
- signed: true if a signature is present, false otherwise (boolean)
- stamp_present: true if a company stamp is visible, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

off_schema_items: array — EXHAUSTIVE capture of every visible content block NOT already stored in the
structured fields above. Any printed, stamped, handwritten, or watermarked text that did not go into
a schema field MUST appear here. Per-carton breakdown lines, container/seal numbers, transport
references, declarations ("we hereby certify…"), footer text, page headers, reference codes, contact
details — all count.

Each item: {"kind": "...", "value": "<verbatim text>", "field_hint": "<canonical field if related, else null>",
            "page": <int>, "confidence": 0.0-1.0}

Allowed "kind" values:
- "free-text"   — DEFAULT for any printed text block not captured by a schema field (per-carton
                  detail rows, declarations, footer text, headers, anything else printed).
                  Preserve line breaks with \n.
- "handwritten" — handwritten annotation
- "stamp"       — ink stamp / seal
- "watermark"   — watermark text
- "correction"  — struck-through or corrected text; also include "original": "<old text>",
                  "authenticated": true/false

Coverage self-check (mandatory): re-scan the page; if any printed/written region is not in a schema
field or off_schema item, add it as "free-text" before returning. When in doubt, INCLUDE it.

IMPORTANT:
- Shipping marks must be extracted verbatim — these are checked against the B/L
- If packing list shows per-carton breakdown, consolidate to totals in the schema fields, but still
  capture the per-carton detail rows as "free-text" off_schema_items so nothing is lost
- off_schema_items must NEVER be empty unless the page is genuinely blank apart from schema fields
- Do NOT wrap output in markdown code blocks
