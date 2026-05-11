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
- signature_party: party that signed (e.g. "BENEFICIARY", "DIRECTOR", or named individual) (string or null)
- signed: true if a handwritten or authenticated signature is present, false otherwise (boolean)
- stamp_present: true if a company stamp/seal is present, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, DUPLICATE, or null

CERTIFICATE-SPECIFIC HINTS (UCP/ISBP context — extract evidence accordingly):
- bc_conditions_text is the spine of CERT-01. The rule reads it back verbatim and checks each LC :46A:/:47A: clause that required the certificate. Do not paraphrase, condense, or split. Preserve every "We hereby certify…" sentence in full. Multi-page certifications: concatenate with \n\n between pages.
- signed: per ISBP Q3, a company stamp alone is NOT a signature. signed=true requires either a visible handwritten signature OR a digitally-authenticated signature mark explicitly attributable to a person.
- signature_party: when the LC requires "signed by beneficiary" or "signed by Director", the signature line typically names or labels the signer. Extract that label/name verbatim. If only a signature is visible without identifying label, set signature_party=null.
- The signature block (signature + name + title + company) is one logical unit; capture as off_schema_items with tag ["signature_block"] in addition to populating the schema fields.

PROVENANCE — raw_quotes (mandatory)
-----------------------------------
For every schema field you populated with a non-null value, include the verbatim
source text in a top-level "raw_quotes" object, keyed by the same field name.

Example:
  "bc_conditions_text": "We hereby certify that the goods supplied comply with EU Regulation 2023/45 in all respects.",
  "signature_party": "BENEFICIARY",
  ...
  "raw_quotes": {
    "bc_conditions_text": "We hereby certify that the goods supplied comply with EU Regulation 2023/45 in all respects.",
    "signature_party": "Signed by: ACME CORP / Authorised Signatory (BENEFICIARY)",
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
    "bc_conditions_text": 1.0,
    "signature_party": 0.8
  }

If a field is null, omit it from field_confidence.

OFF-SCHEMA ITEMS — exhaustive open-world capture
------------------------------------------------
off_schema_items: array — EXHAUSTIVE capture of every visible content block NOT
already stored in the structured fields above (note: condition statements belong
in bc_conditions_text, NOT here). Letterhead text, contact details,
registration/tax IDs, addressee block, reference codes, footer notes, page
headers/footers, attestation clauses, and any other printed remark all count.

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
  letterhead · addressee · attestation · signature_block · stamp_seal ·
  watermark · contact_info · registration_id · reference_code · header ·
  footer · disclaimer · handwritten_signature · handwritten_amendment ·
  handwritten_initials · handwritten_note

Allowed "kind" values (legacy):
- "free-text", "stamp", "watermark", "correction"
- "handwritten" — ANY pen/ink markings (signatures, margin notes, amendments,
  initials, handwritten dates). Capture EVERY handwritten region as a SEPARATE
  off_schema_items entry, EVEN IF the same content is also reflected in a
  schema field (a handwritten signature is BOTH signed=true AND a
  kind="handwritten" off-schema item). Stamps and handwriting are independent.
  Examples:
    • signature → kind=handwritten. For raw_quote, use this priority:
      (1) the signer's NAME printed/typed beside or below the signature line
      (e.g. "John Smith" under the scrawl); (2) the handwritten name if
      written in legible block letters or clear cursive; (3) the literal
      string "[handwritten — text not identified]" when neither is available.
      Never use "illegible". When BOTH a stylised scrawl AND a printed name
      appear, ALWAYS pick the printed name.
      tags=["handwritten_signature", "signature_block"]
    • amendment "QTY 250 → 240" → kind=handwritten,
      tags=["handwritten_amendment", "correction"]
    • initials / handwritten date → kind=handwritten,
      tags=["handwritten_initials"]

Coverage self-check (mandatory): re-scan the page; if any printed/written
region is not in a schema field (including bc_conditions_text) or off_schema
item, add it as "free-text" before returning. Handwritten content (any pen/ink
markings) MUST be captured as a kind="handwritten" off-schema item even if
also reflected in a schema field. When in doubt, INCLUDE it.

IMPORTANT:
- bc_conditions_text: extract VERBATIM — this is critical for CERT-01 which checks that all stipulating LC clauses are satisfied
- signed: per ISBP Q3, a company stamp alone is NOT a signature
- raw_quotes must contain an entry for every non-null schema field
- off_schema_items must NEVER be empty unless the page is genuinely blank apart from schema fields
- Do NOT wrap output in markdown code blocks
