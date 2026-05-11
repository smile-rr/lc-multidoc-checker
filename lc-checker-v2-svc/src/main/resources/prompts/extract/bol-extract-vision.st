You are an expert trade finance document analyst. Extract ALL structured fields from this Bill of Lading (B/L) image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- bol_number: B/L number/reference (string)
- bl_date: B/L issue date in YYYY-MM-DD format (string or null)
- bl_form_type: "shipped_on_board" if pre-printed shipped-on-board form, "received_for_shipment" if received-for-shipment form requiring a separate on-board notation, or null if cannot determine (string)
- shipment_date: on-board date (from on-board notation if present, else B/L issue date when bl_form_type is "shipped_on_board") in YYYY-MM-DD format (string or null)
- onboard_notation: full text of the on-board notation if present (string or null). IMPORTANT: this is the notation that says "Shipped on board" or similar with a date. If pre-printed and no separate notation, state "PRE-PRINTED".
- carrier_name: shipping line / carrier name (string or null)
- beneficiary_name: shipper/exporter name (string or null)
- consignee: consignee name or "TO ORDER" / "TO ORDER OF [BANK]" (string or null)
- notify_party: notify party name and address (string or null)
- port_of_loading: port of loading exactly as printed (string)
- port_of_discharge: port of discharge exactly as printed (string)
- freight_terms: PREPAID or COLLECT or null (string)
- originals_required: number of original B/Ls required per credit (integer or null)
- originals_presented: number of original B/Ls presented (integer or null). Look for "X/X ORIGINALS" notation.
- clean_indicator: true if B/L has no defect/damage clause, false if it does (boolean)
- on_deck_notation: any "on deck" or "said to contain" clauses (string or null)
- quantity: cargo quantity with unit (string, e.g. "500 MT" or "20 CTNS")
- total_packages: total number of packages/containers (string or null)
- shipping_marks: shipping marks and numbers as printed (string or null)
- total_gross_weight: total gross weight with unit (string or null)
- total_net_weight: total net weight with unit (string or null)
- incoterms: Incoterms term if stated on B/L (CIF/FOB/CFR/etc. or null)
- goods_description: cargo / commodity description verbatim as printed in the goods column (string or null) — used by XD-02 to verify B/L description is not inconsistent with INV/LC :45A:. Per UCP 14(e), the B/L description MAY be in general terms but MUST NOT contradict the LC.
- signed: true if signed by carrier/master/agent, false otherwise (boolean)
- signature_party: printed name and/or capacity of the signatory (e.g. "ABC Shipping Lines, as Carrier"); null if unsigned
- stamp_present: true if carrier stamp visible, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, or null

BOL-SPECIFIC HINTS (UCP/ISBP context — extract evidence accordingly):
- bl_form_type is critical: "received_for_shipment" forms REQUIRE a separate dated on-board notation per UCP 20(a)(ii); "shipped_on_board" forms treat the B/L issue date as the shipment date unless an on-board notation states otherwise. Determine the form by reading the title/heading at the top of the B/L (e.g. "SHIPPED ON BOARD" vs "RECEIVED FOR SHIPMENT").
- For clean_indicator: any clause expressly declaring defective goods or packaging = false (UCP 27). "Shipper's load and count" / "said to contain" notations do NOT make B/L unclean (ISBP D25). "Clean on board" stamp need not appear if no defect is shown (ISBP D27). Quote the exact defect notation as off_schema_items raw_quote with tag ["defect_notation"] when present.
- on_deck_notation: UCP 26 prohibits a transport document indicating goods are or will be loaded on deck unless the LC permits it. Capture any "ON DECK" stamp or clause verbatim. "Said to contain" is NOT an on-deck notation — separate concern.
- freight_terms: typically "FREIGHT PREPAID" / "FREIGHT COLLECT" stamp or printed on the B/L. May appear as a separate stamp; capture the stamp's verbatim text in off_schema_items with tag ["freight_terms"].
- shipment_date: priority order — on-board notation date > pre-printed shipped-on-board issue date > null (do not infer).
- "TO ORDER" / "TO ORDER OF [BANK]" consignee patterns indicate negotiable B/L; do not normalize, preserve verbatim.

PROVENANCE — raw_quotes (mandatory)
-----------------------------------
For every schema field you populated with a non-null value, include the verbatim
source text in a top-level "raw_quotes" object, keyed by the same field name.
This is the audit trail. Rules quote it back to the bank officer when reporting
discrepancies.

Example:
  "shipment_date": "2026-04-10",
  "onboard_notation": "SHIPPED ON BOARD VESSEL EVERGREEN-X 10 APR 2026",
  ...
  "raw_quotes": {
    "shipment_date": "SHIPPED ON BOARD VESSEL EVERGREEN-X 10 APR 2026",
    "onboard_notation": "SHIPPED ON BOARD VESSEL EVERGREEN-X 10 APR 2026 [signed]",
    "freight_terms": "FREIGHT PREPAID AT LOAD PORT",
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
    "bl_number": 1.0,
    "vessel_name": 0.8,
    "shipping_marks": 0.6
  }

If a field is null, omit it from field_confidence.

OFF-SCHEMA ITEMS — exhaustive open-world capture
------------------------------------------------
off_schema_items: array — EXHAUSTIVE capture of every visible content block NOT
already stored in the structured fields above. The audit trail must be complete:
any printed, stamped, handwritten, or watermarked text on the page that did not
go into a schema field MUST appear here. Do not summarise or skip text because
it looks like boilerplate. Carrier clauses, conditions of carriage, freight
clauses, container/seal numbers, B/L type stamps ("CLEAN ON BOARD"),
endorsements, shipper notations, notify-party blocks, footer text, page numbers,
reference codes — all count. Hand-stamped clauses on page 2+ MUST be captured.

Each item:
  {
    "raw_quote": "<verbatim text — copy character-for-character>",
    "tags": ["<one or more from the tag vocabulary>"],
    "page": <int>,
    "confidence": 0.0-1.0,
    "kind": "<one of the legacy kinds below>",
    "value": "<short summary or verbatim if short>",
    "field_hint": "<canonical field name if related, else null>",
    "location": "<positional hint, optional>",
    "original": "<correction only>",
    "authenticated": true/false
  }

Tag vocabulary (lowercase snake_case):
  freight_terms · clean_indicator_stamp · defect_notation · on_deck_notation ·
  endorsement · carrier_clause · conditions_of_carriage · container_seal ·
  shipping_marks · package_marks · signature_block · stamp_seal · watermark ·
  reference_code · header · footer · contact_info · disclaimer ·
  handwritten_signature · handwritten_amendment · handwritten_initials ·
  handwritten_note

Allowed "kind" values (legacy):
- "free-text", "stamp", "watermark", "correction"
- For "stamp": e.g. "CLEAN ON BOARD" stamp → kind=stamp, raw_quote=full stamp text, tags=["clean_indicator_stamp", "stamp_seal"]
- "handwritten" — ANY pen/ink markings (carrier signatures, master signatures,
  manual amendments to ports / dates / quantities, "ORIGINAL" hand-marks,
  initials, handwritten countersignatures next to a stamp). Capture EVERY
  handwritten region as a SEPARATE off_schema_items entry, EVEN IF the same
  content is also reflected in a schema field (a handwritten carrier signature
  is BOTH signed=true AND a kind="handwritten" off-schema item). Stamps and
  handwriting are independent — do NOT collapse a handwritten countersignature
  on a stamp into one entry.
  Examples:
    • carrier signature → kind=handwritten. For raw_quote, use this priority:
      (1) the signer's NAME printed/typed beside or below the signature line
      (e.g. "Master: J. Tan" under the scrawl); (2) the handwritten name if
      written in legible block letters or clear cursive; (3) the literal
      string "[handwritten — text not identified]" when neither is available.
      Never use "illegible". When BOTH a stylised scrawl AND a printed name
      appear, ALWAYS pick the printed name.
      tags=["handwritten_signature", "signature_block"]
    • amendment "DISCHARGE: SINGAPORE → JAKARTA" → kind=handwritten,
      tags=["handwritten_amendment", "correction"]
    • handwritten "ORIGINAL" / set marker → kind=handwritten,
      tags=["handwritten_note"]

Coverage self-check (mandatory): mentally re-scan the page top-to-bottom. For
every printed/written region, confirm it landed in EITHER a schema field (with
raw_quote in raw_quotes) OR an off_schema_items entry. If anything is
unaccounted for, add it as "free-text". Handwritten content (any pen/ink
markings) MUST be captured as a kind="handwritten" off-schema item even if
also reflected in a schema field. When in doubt, INCLUDE it.

IMPORTANT:
- raw_quotes must contain an entry for every non-null schema field
- off_schema_items must NEVER be empty unless the page is genuinely blank apart from schema fields
- Do NOT wrap output in markdown code blocks
