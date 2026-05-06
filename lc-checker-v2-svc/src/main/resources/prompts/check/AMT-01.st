PURPOSE
-------
Decide whether the invoice total is within the LC amount, applying the
correct UCP 600 Art. 18(b) / Art. 30(a)(b)(c) / :39A: tolerance ladder.
NEVER exceed the LC ceiling implied by the chosen tolerance.

CITATIONS
---------
UCP 600 Art. 18(b) — invoice amount must not exceed the amount permitted by
                     the credit (the credit amount + applicable tolerance).
UCP 600 Art. 30(a) — "about" / "approximately" applied to the credit amount,
                     quantity, or unit price = ±10%.
UCP 600 Art. 30(b) — quantity tolerance ±5% allowed unless quantity is in
                     packing units / individual items, AND drawings must
                     not exceed credit amount.
UCP 600 Art. 30(c) — even when partial shipments prohibited, ±5% LESS than
                     credit amount allowed if full quantity shipped and
                     unit price unchanged.
ISBP 821 C9        — invoice amount must not exceed credit amount taking
                     into account permitted tolerances.
ISBP 821 C10       — Art. 30(b) ±5% applies even when not stated.

TOLERANCE LADDER (apply in order — first match wins)
----------------------------------------------------
1. EXPLICIT :39A: percentage (e.g. "10/10", "5/10").
   → tolerance_plus / tolerance_minus already parsed; ceiling is
     credit_amount × (1 + tolerance_plus / 100).
2. about_credit_amount = true (credit prefixed "ABOUT" / "APPROXIMATELY").
   → Apply Art. 30(a): ±10% on amount.
3. Bulk-goods quantity (no packing units / pieces) and no :39A:.
   → Art. 30(b) implicit: invoice amount must NOT exceed credit_amount
     (no plus tolerance, even though quantity itself may flex ±5%).
4. Default. → Exact amount; any overdraw is FAIL.

INPUTS (already inlined in the user prompt)
-------------------------------------------
- credit_amount, credit_currency
- about_credit_amount       (boolean — :32B: prefixed "ABOUT")
- tolerance_plus / tolerance_minus  (integer percent, from :39A:)
- invoice_total

TOOL USAGE (AGENT_TOOL — single round)
--------------------------------------
- The system prompt's tool-use policy applies: at most ONE round of
  tool calls, then terminal JSON. Issue all calls in parallel.
- For the ceiling math (credit_amount × (1 + tolerance/100)) and the
  comparison invoice_total vs ceiling, invoke verifyArithmetic to keep
  the math reproducible. Pass `quantity = credit_amount`,
  `unit_price = (1 + tolerance_plus/100)`, `total_amount = ceiling`,
  `epsilon = 0.01` to verify the ceiling, then compare invoice_total
  against the verified ceiling in your verdict.

DECISION RULES
--------------
PASS  — invoice_total ≤ ceiling (rounded to currency precision) AND
        invoice_total in same currency as credit (currency mismatch is
        handled by CCY-01 — assume same currency at this rule).
FAIL  — invoice_total > ceiling (this is the canonical Art. 18(b) breach).
DOUBTS — invoice_total or credit_amount unparseable / null.
NOT_APPLICABLE — credit_amount missing entirely (the trigger guard should
                 have caught this; if not, return NA citing :32B: absent).

EVIDENCE FORMAT
---------------
"PASS — invoice 60,000.00 USD ≤ ceiling 66,000.00 (LC 60,000 +10% per
:39A:); UCP 600 Art. 18(b)/30(a)."
"FAIL — invoice 67,500.00 USD > ceiling 66,000.00 (LC 60,000 +10% per
:39A:); overdraw 1,500.00; UCP 600 Art. 18(b)."

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<ceiling math + UCP cite>","confidence":<0.0-1.0>}
