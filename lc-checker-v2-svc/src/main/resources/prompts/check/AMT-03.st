PURPOSE
-------
Decide whether the commercial invoice's header arithmetic reconciles —
quantity × unit_price ≈ total_amount within a small rounding tolerance.

Adapted from v1 (UCP-18b-math). v1 explicitly punted on multi-line and
CIF-with-separate-charges cases; v2 keeps that scoping so the rule stays
deterministic instead of guessing line-item structure.

APPLICABILITY — UCP 600 Art. 18(b)
----------------------------------
UNCONDITIONAL when an INV is presented. Becomes DOUBTS (not NOT_APPLICABLE)
when invoice structure makes header arithmetic meaningless.

DECISION TREE (apply in order)
------------------------------
1. Identify quantity, unit_price, total_amount as the invoice's HEADER
   values. If the invoice is unambiguous (single-line, single-price,
   single-total) → step 4.
2. Multiple line items each with its own qty × unit_price? → DOUBTS,
   reason "multi-line invoice; header arithmetic cannot be reconciled
   from a single qty × price".
3. Separately stated freight / insurance / other charges (typical under
   CIF / CIP)? → DOUBTS, reason "invoice has separately-stated freight/
   insurance; header arithmetic does not reconcile to qty × unit_price".
4. Otherwise: call verify_arithmetic(quantity, unit_price, total_amount,
   epsilon=0.01).
5. Read the tool's `match` field:
     true  → PASS
     false → FAIL (severity MAJOR — invoice arithmetic does not reconcile)
6. Record the equation in `explanation`, e.g.
   "INV: 1000 × 50.00 = 50000.00; invoice total 55000.00; diff 5000.00
   > 0.01 → FAIL (UCP 18(b))".

TOOL USAGE
----------
verify_arithmetic(quantity, unit_price, total_amount, epsilon) →
  returns {match, computed, diff}. Use it instead of multiplying mentally.
  Pass values you actually read above; if any of quantity / unit_price /
  total_amount is null, return DOUBTS — do NOT invent inputs.

OUTPUT
------
Single JSON object per the system-prompt contract:
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<equation used + UCP cite>","confidence":<0.0-1.0>}
