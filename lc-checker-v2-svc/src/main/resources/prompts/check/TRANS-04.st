RULE: TRANS-04 — Freight terms conform to LC and Incoterm

AUTHORITY
{{ref.UCP-26.id}} — {{ref.UCP-26.heading}}
"{{ref.UCP-26.text}}"

{{ref.ISBP-D24.id}} — {{ref.ISBP-D24.heading}}
"{{ref.ISBP-D24.text}}"

TASK
Verify two related concerns:
  (a) Freight bearing on the BOL is consistent with the invoice Incoterm:
      CFR / CIF / CIP / CPT / DDP → expect "FREIGHT PREPAID" notation
      FOB / FCA / EXW / FAS       → expect "FREIGHT COLLECT" notation
      "FREIGHT PAYABLE AT…" wording counts as collect.
  (b) Per UCP 26, the BOL must NOT indicate that goods are loaded on deck
      unless the LC permits it. "On deck OR under deck" is acceptable
      ("said to contain" is not an on-deck notation — that's a separate
      ISBP concern handled here only when explicit "ON DECK").

EVIDENCE TO CONSIDER
- INV incoterms (with raw_quote — full surrounding clause).
- BOL freight_terms field.
- BOL off_schema_items[] — many freight notations appear as ink stamps,
  not as printed fields. Examine items tagged "freight_terms" or
  "stamp_seal" carrying freight wording.
- BOL on_deck_notation field.

DECISION
- PASS  : freight notation matches Incoterm AND no impermissible on-deck
          notation found.
- FAIL  : Incoterm/freight mismatch (e.g. CIF + freight collect) OR
          on-deck stamp without LC permission. Quote the offending text.
- DOUBTS: Incoterm not extractable, or freight wording is novel and
          could plausibly read either way.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence>"}
