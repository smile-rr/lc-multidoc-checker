PURPOSE
-------
Decide whether the commercial invoice's drawn amount (and the bill-of-exchange
draft amount, when presented) complies with UCP 600 Art. 18(b) read with the
tolerance precedence stack of UCP 600 Art. 30(a)(b)(c) and ISBP 821 C9-C10.

A draw is compliant only when (1) the invoice total is at or below the LC
amount inflated by the applicable tolerance, AND (2) any presented draft
amount equals or matches the invoice amount per ISBP B3.

TOLERANCE PRECEDENCE (apply in order — first matching rule wins)
----------------------------------------------------------------
1. Explicit :39A: percentage in the LC (e.g. "5/5", "10/0") — use exactly that
   tolerance for the invoice amount. tolerance_plus / tolerance_minus carry the
   parsed values.
2. about_credit_amount = true (LC :32B: contains ABOUT or APPROXIMATELY) →
   ±10% on BOTH quantity and amount per UCP 30(a).
3. Bulk goods drawn against an LC stating quantity in MT/KG/L/etc. without a
   stipulated number of packing units → quantity ±5% per UCP 30(b), but the
   total drawn amount must NOT exceed the LC amount.
4. Default — invoice_total must not exceed credit_amount; PASS when ≤, FAIL when >.

COMMON MISTAKES — flag as FAIL
------------------------------
- Treating quantity ±5% as also allowing amount ±5%. UCP 30(b) does NOT
  authorise the drawn amount to exceed the LC amount; if quantity is reduced
  by 5%, the drawn amount must drop proportionally too.
- Stacking :39A: + ABOUT (they are alternatives — never add them).
- Drawing for a foreign-currency amount without first converting to LC currency.

PER-DOC EVIDENCE FORMAT
-----------------------
In your `explanation`, for every document evaluated, produce a concise marker:
  "INV: invoice_total=<x>, allowed=<x>±<y>, result=<within|exceeds>;
   BOE: draft_amount=<x>, matches invoice=<yes|no>"
Always cite the UCP/ISBP article that drives the verdict.

VERDICT GUIDANCE
----------------
PASS           — invoice ≤ allowed cap AND draft matches invoice (when present).
FAIL           — invoice > allowed cap OR draft amount conflicts with invoice
                 amount (ISBP B3) OR currency does not match (UCP 18(a)(iii)).
DOUBTS         — extracted amounts are blank or unparseable; an officer must
                 read the source.
NOT_APPLICABLE — credit_amount or credit_currency missing from the LC.

TOOL USAGE
----------
Most field values you need are already injected above under "LC fields" /
"Document fields". Use tools only for values that are missing there. When
you do call tools, issue ALL needed calls in a SINGLE assistant turn (the
runtime executes them in parallel) — do not chain calls one-by-one. You
have a hard budget of 2 LLM turns: turn-1 either answers directly OR emits
all tool calls, turn-2 reads results and emits the terminal JSON.

OUTPUT
------
Respond with exactly one JSON object per the system-prompt contract:
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence with per-doc evidence + UCP/ISBP cite>","confidence":<0.0-1.0>}
