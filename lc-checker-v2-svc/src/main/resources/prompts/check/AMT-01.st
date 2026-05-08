RULE: AMT-01 — Invoice amount and currency conform to LC, within tolerance

AUTHORITY
{{ref.UCP-18-b.id}} — {{ref.UCP-18-b.heading}}
"{{ref.UCP-18-b.text}}"

{{ref.UCP-30-b.id}} — {{ref.UCP-30-b.heading}}
"{{ref.UCP-30-b.text}}"

TASK
Verify three things in one pass:
  (a) Invoice currency = LC :32B: credit_currency.
  (b) Invoice total amount is within the LC's stated tolerance — UCP 30(b)
      ±5% applies when the quantity is not stipulated in stated packing
      units AND the LC does not prohibit partial drawings; otherwise the
      tolerance is whatever :39A: prescribes (tolerance_plus / tolerance_minus
      as percentages). The :39B: max_amount_flag may further constrain.
  (c) Arithmetic: if the invoice supplies quantity × unit_price line items,
      they must sum (within 1¢ rounding) to invoice_total.

Use the verifyArithmetic(quantity, unit_price, total_amount, epsilon) tool
for the arithmetic check; use a calculator/tool for tolerance percentages
where needed. Do not approximate.

Read LC :47A: additional_conditions for any unit-price override clauses
that affect the tolerance basis (e.g. "Unit price USD 12.50/PC", which
would shift to a unit-price tolerance interpretation).

DECISION
- PASS  : currency matches AND amount within tolerance AND arithmetic sound.
- FAIL  : any of the three fails. Cite the offending value(s) with raw_quotes
          and the tolerance band actually applied.
- DOUBTS: tolerance basis ambiguous (e.g. :47A: unit-price clause uncertain).

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence>"}
