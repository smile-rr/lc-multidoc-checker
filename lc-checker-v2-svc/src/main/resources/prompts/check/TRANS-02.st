RULE: TRANS-02 — B/L is clean (no defect/damage clauses)

AUTHORITY
{{ref.UCP-27.id}} — {{ref.UCP-27.heading}}
"{{ref.UCP-27.text}}"

{{ref.ISBP-D25.id}} — {{ref.ISBP-D25.heading}}
"{{ref.ISBP-D25.text}}"

TASK
A clean transport document bears no clause expressly declaring a defective
condition of the goods or packaging (UCP 27).

EXCLUSIONS — these do NOT make the B/L unclean:
  - "Shipper's load and count", "said to contain", "contents unknown" — per
    ISBP D25, these are common-form notations and do not reflect defective
    condition.
  - The word "clean" need not appear (ISBP D27).
  - "On deck" notation is a separate concern (TRANS-04 handles UCP 26).

DEFECT examples that DO make the B/L unclean:
  - "Bags torn", "drums leaking", "packages damaged"
  - "Goods rust-stained on receipt"
  - Any explicit declaration of defective packaging or merchandise.

EVIDENCE TO CONSIDER
- BOL clean_indicator field (extractor's binary judgement).
- BOL on_deck_notation (informational — not an uncleanliness indicator
  unless the LC prohibits on-deck shipment).
- BOL off_schema_items[] — this is where most defect clauses appear, often
  as hand-stamped notations on page 2+. Examine each item for defect text.

DECISION
- PASS  : no defect notation found. ISBP D25 exclusions present but
          correctly classified as non-defect.
- FAIL  : explicit defect notation found. Quote it verbatim from
          off_schema_items raw_quote.
- DOUBTS: ambiguous notation (e.g. "package marks faded") that could
          plausibly read as either condition or cosmetic.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence; quote the offending raw_quote if FAIL>"}
