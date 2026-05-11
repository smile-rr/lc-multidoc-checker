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
- signature_party: party that signed (e.g. "BENEFICIARY", "DIRECTOR", or named individual) (string or null)
- signed: true if a handwritten or authenticated signature is present, false otherwise (boolean)
- stamp_present: true if a company stamp/seal is present, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

CERTIFICATE-SPECIFIC HINTS (UCP/ISBP context — extract evidence accordingly):
- wc_conditions_text is the spine of CERT-01 (BC + WC unified rule). The rule reads it back verbatim and checks each LC :46A:/:47A: clause that required the certificate. Do not paraphrase, condense, or split. Preserve every "We warrant that…" / "We hereby certify…" sentence in full.
- signed: per ISBP Q3, a company stamp alone is NOT a signature. signed=true requires either a visible handwritten signature OR a digitally-authenticated signature mark.
- signature_party: extract the labelled signer ("Authorised Signatory", "BENEFICIARY", named individual + title) verbatim. If only a signature is visible without identifying label, set signature_party=null.
- Distinguish wc_scope (what goods are covered) from wc_period (how long the warranty lasts). Both may be embedded in the same paragraph; extract each into its own field while preserving the full text in wc_conditions_text.

PROVENANCE — raw_quotes (mandatory)
-----------------------------------
For every schema field you populated with a non-null value, include the verbatim
source text in a top-level "raw_quotes" object, keyed by the same field name.

Example:
  "wc_scope": "1,000 PCS WIDGETS GRADE A MODEL X-12",
  "wc_period": "12 months from delivery date",
  "wc_conditions_text": "We warrant that the goods conform to specification ...",
  ...
  "raw_quotes": {
    "wc_scope": "WARRANTY SCOPE: 1,000 PCS WIDGETS GRADE A MODEL X-12",
    "wc_period": "Warranty period: 12 months from delivery date",
    "wc_conditions_text": "We warrant that the goods conform to specification XYZ-123 and are free from defects ...",
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
    "wc_scope": 1.0,
    "wc_period": 0.9,
    "wc_conditions_text": 0.85
  }

If a field is null, omit it from field_confidence.

OFF-SCHEMA ITEMS — exhaustive open-world capture
------------------------------------------------
off_schema_items: array — EXHAUSTIVE capture of every visible content block NOT
already stored in the structured fields above (warranty terms belong in
wc_conditions_text, NOT here). Letterhead, contact details, addressee block,
reference codes, registration/accreditation numbers, lab/inspection logos
text, footer notes, page headers, and any other printed remark all count.

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
  letterhead · addressee · attestation · warranty_clause · scope_clause ·
  period_clause · signature_block · stamp_seal · watermark · contact_info ·
  registration_id · accreditation · reference_code · header · footer ·
  disclaimer · handwritten_signature · handwritten_amendment ·
  handwritten_initials · handwritten_note

Allowed "kind" values (legacy):
- "free-text", "stamp", "watermark", "correction"
- "handwritten" — ANY pen/ink markings (signatures, margin notes, manual
  amendments to scope/period clauses, initials, handwritten dates). Capture
  EVERY handwritten region as a SEPARATE off_schema_items entry, EVEN IF the
  same content is also reflected in a schema field (a handwritten signature
  is BOTH signed=true AND a kind="handwritten" off-schema item). Stamps and
  handwriting are independent.
  Examples:
    • signature → kind=handwritten. For raw_quote, use this priority:
      (1) the signer's NAME printed/typed beside or below the signature line
      (e.g. "John Smith / QA Manager" under the scrawl); (2) the handwritten
      name if written in legible block letters or clear cursive; (3) the
      literal string "[handwritten — text not identified]" when neither is
      available. Never use "illegible". When BOTH a stylised scrawl AND a
      printed name appear, ALWAYS pick the printed name.
      tags=["handwritten_signature", "signature_block"]
    • amendment to scope clause → kind=handwritten,
      tags=["handwritten_amendment", "correction"]
    • initials / handwritten date → kind=handwritten,
      tags=["handwritten_initials"]

Coverage self-check (mandatory): re-scan the page; if any printed/written
region is not in a schema field (including wc_conditions_text) or off_schema
item, add it as "free-text" before returning. Handwritten content (any pen/ink
markings) MUST be captured as a kind="handwritten" off-schema item even if
also reflected in a schema field. When in doubt, INCLUDE it.

IMPORTANT:
- wc_conditions_text: extract VERBATIM — this is critical for CERT-01 which checks all stipulating LC clauses
- raw_quotes must contain an entry for every non-null schema field
- off_schema_items must NEVER be empty unless the page is genuinely blank apart from schema fields
- Do NOT wrap output in markdown code blocks
