RULE: XD-02 — Goods description on PKL/BOL not inconsistent with INV/LC

AUTHORITY
{{ref.UCP-14-e.id}} — {{ref.UCP-14-e.heading}}
"{{ref.UCP-14-e.text}}"

TASK
UCP 14(e) permits documents OTHER than the commercial invoice (here: PKL
and BOL) to describe goods in GENERAL terms but PROHIBITS inconsistency
with the LC :45A: and the INV description.

This rule is NOT the same as GOODS-01 (which checks INV strictly
"corresponds to" LC :45A:). Here the bar is lower: "not inconsistent."

Examples of acceptable variation on PKL/BOL:
  - LC :45A: "1,000 PCS WIDGETS GRADE A MODEL X-12"
  - PKL    : "1,000 PCS WIDGETS"                            ← OK (general terms)
  - BOL    : "WIDGETS"                                      ← OK (general terms)

Examples of inconsistency (FAIL):
  - INV    : "WIDGETS GRADE A"
  - PKL    : "WIDGETS GRADE B"                              ← FAIL (different grade)
  - BOL    : "WIDGETS MODEL X-13"                           ← FAIL (different model)

Use INV and LC :45A: as the reference. Look at PKL goods_description and
BOL quantity/goods notation, plus their off_schema_items where the goods
might also be re-stated on stamps or page 2.

DECISION
- PASS  : PKL/BOL goods are equal to or a generalisation of INV/LC. Added
          carrier-specific verbiage acceptable.
- FAIL  : PKL or BOL contradicts (different commodity, grade, model,
          spec). Quote the contradicting raw_quotes.
- DOUBTS: PKL/BOL goods are vague AND ambiguous as to whether they could
          encompass the INV's specific description.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence>"}
