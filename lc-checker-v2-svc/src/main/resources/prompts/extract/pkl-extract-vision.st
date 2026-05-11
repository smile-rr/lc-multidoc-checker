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
- packages_per_carton: structured breakdown if present (array of {carton_no, quantity, net_wt, gross_wt} or null)
- consolidation_type: "master_pack" if the document indicates consolidated/master packing, "per_carton" if itemized, "aggregate_only" if only totals shown, or null
- goods_description: goods description as printed (string or null) — used by XD-02 to verify PKL description not inconsistent with INV/LC :45A:
- signed: true if a signature is present, false otherwise (boolean)
- signature_party: printed name and/or title of the signing party (e.g. "ACME Trading Co., Manager"); null if unsigned
- stamp_present: true if a company stamp is visible, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

PACKING-LIST-SPECIFIC HINTS (UCP/ISBP context — extract evidence accordingly):
- Per-carton breakdown structure matters for cross-document quantity/weight reconciliation (XD-01). If the document shows per-carton rows (e.g. "CTN 1: 50 PCS / 25 KG / 26 KG", "CTN 2: …"), extract them into "packages_per_carton" AND verify the sum matches "total_packages"/"total_net_weight"/"total_gross_weight". If sums diverge, note discrepancy in off_schema_items with tag ["sum_inconsistency"].
- Shipping marks block: this is checked against the B/L per UCP 14(e). Extract the FULL marks block verbatim — including line breaks — into "shipping_marks". Marks often span multiple lines and may include addresses, port codes, package counts, batch numbers.
- Consolidation: distinguish "master pack" (one outer carton containing N inner items) from "per carton" (each item is its own carton). The consolidation type affects how XD-01 reconciles INV ↔ PKL ↔ BOL counts.
- "Said to contain" / "shipper's load and count" notations on PKL do not affect cleanliness checks (those are BOL-only) but DO affect quantity reliability. Capture verbatim with tag ["shipper_count_notation"].
- Weight units: kg vs MT vs lbs — preserve the unit token exactly as printed; do not normalize.

PROVENANCE — raw_quotes (mandatory)
-----------------------------------
For every schema field you populated with a non-null value, include the verbatim
source text in a top-level "raw_quotes" object, keyed by the same field name.

Example:
  "total_packages": "200 CTNS",
  "total_net_weight": "5,000 KGS",
  "shipping_marks": "ACME / HAMBURG / 1-200 / MADE IN CHINA",
  ...
  "raw_quotes": {
    "total_packages": "TOTAL: 200 CARTONS",
    "total_net_weight": "Net Weight: 5,000 KGS",
    "shipping_marks": "MARKS & NUMBERS:\nACME\nHAMBURG\n1-200\nMADE IN CHINA",
    ...
  }

If a field value is null, do not include a key for it in raw_quotes.

PROVENANCE — field_confidence (mandatory)
-----------------------------------------
For every schema field you populated with a non-null value, emit a confidence
score (0.0–1.0) in a top-level "field_confidence" object, keyed by field name.
Confidence reflects how clearly the value was visible/legible/unambiguous on
the page — NOT how confident you are in the document's authenticity.

  - 1.0 — printed cleanly, single unambiguous value
  - 0.7-0.9 — present but visually noisy / partially obscured / inferred from context
  - <0.5 — heavily damaged / handwritten / multiple candidates / OCR-uncertain

Example:
  "field_confidence": {
    "total_packages": 1.0,
    "total_net_weight": 0.9,
    "shipping_marks": 0.6
  }

If a field is null, omit it from field_confidence.

OFF-SCHEMA ITEMS — exhaustive open-world capture
------------------------------------------------
off_schema_items: array — EXHAUSTIVE capture of every visible content block NOT
already stored in the structured fields above. Per-carton breakdown rows (if not
captured in packages_per_carton), container/seal numbers, transport references,
declarations ("we hereby certify…"), footer text, page headers, reference
codes, contact details — all count.

Each item:
  {
    "raw_quote": "<verbatim text>",
    "tags": ["<from tag vocabulary below>"],
    "page": <int>,
    "confidence": 0.0-1.0,
    "kind": "<legacy kind>",
    "value": "<short summary or verbatim if short>",
    "field_hint": "<canonical field if related, else null>",
    "location": "<optional>",
    "original": "<correction only>",
    "authenticated": true/false
  }

Tag vocabulary (lowercase snake_case):
  package_marks · shipping_marks_block · per_carton_row · sum_inconsistency ·
  shipper_count_notation · container_seal · transport_reference ·
  declaration · certification · signature_block · stamp_seal · watermark ·
  reference_code · header · footer · contact_info ·
  handwritten_signature · handwritten_amendment · handwritten_initials ·
  handwritten_note

Allowed "kind" values (legacy):
- "free-text", "stamp", "watermark", "correction"
- "handwritten" — ANY pen/ink markings (packer signatures, manual carton-count
  amendments, hand-written shipping marks, initials, handwritten dates).
  Capture EVERY handwritten region as a SEPARATE off_schema_items entry,
  EVEN IF the same content is also reflected in a schema field (a handwritten
  signature is BOTH signed=true AND a kind="handwritten" off-schema item).
  Stamps and handwriting are independent.
  Examples:
    • packer signature → kind=handwritten. For raw_quote, use this priority:
      (1) the signer's NAME printed/typed beside or below the signature line
      (e.g. "Packer: John Smith" under the scrawl); (2) the handwritten name
      if written in legible block letters or clear cursive; (3) the literal
      string "[handwritten — text not identified]" when neither is available.
      Never use "illegible". When BOTH a stylised scrawl AND a printed name
      appear, ALWAYS pick the printed name.
      tags=["handwritten_signature", "signature_block"]
    • manual carton-count amendment "200 → 195" → kind=handwritten,
      tags=["handwritten_amendment", "correction"]
    • initials / handwritten date → kind=handwritten,
      tags=["handwritten_initials"]

Coverage self-check (mandatory): re-scan the page; if any printed/written
region is not in a schema field or off_schema item, add it as "free-text"
before returning. Handwritten content (any pen/ink markings) MUST be captured
as a kind="handwritten" off-schema item even if also reflected in a schema
field. When in doubt, INCLUDE it.

IMPORTANT:
- Shipping marks must be extracted verbatim — these are checked against the B/L (UCP 14(e), ISBP C12)
- If packing list shows per-carton breakdown, populate packages_per_carton AND retain the per-carton detail rows as off_schema_items entries with tag ["per_carton_row"]
- raw_quotes must contain an entry for every non-null schema field
- off_schema_items must NEVER be empty unless the page is genuinely blank apart from schema fields
- Do NOT wrap output in markdown code blocks
