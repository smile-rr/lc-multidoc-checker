You are an expert trade finance document analyst. Extract ALL structured fields from this Bill of Lading (B/L) image(s).

Return a single JSON object. No markdown fences, no explanation — JSON only.

Required fields to extract:
- bol_number: B/L number/reference (string)
- bl_date: B/L issue date in YYYY-MM-DD format (string or null)
- shipment_date: on-board date (from on-board notation if present, else B/L issue date) in YYYY-MM-DD format (string or null)
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
- signed: true if signed by carrier/master/agent, false otherwise (boolean)
- stamp_present: true if carrier stamp visible, false otherwise (boolean)
- watermark_type: ORIGINAL, COPY, or null

off_schema_items: array — same format as other doc types:
{"kind": "handwritten"|"stamp"|"watermark"|"correction", "value": "...", "field_hint": "...", "page": 1, "confidence": 0.0-1.0}
For corrections: also include "original": "old text", "authenticated": true/false

IMPORTANT:
- For clean_indicator: any clause declaring defective goods/packaging = false. "Said to contain" and "shipper's count" do NOT make B/L unclean per UCP 27.
- shipment_date: use the on-board notation date, NOT the B/L issue date, unless pre-printed shipped-on-board
- Do NOT wrap output in markdown code blocks
