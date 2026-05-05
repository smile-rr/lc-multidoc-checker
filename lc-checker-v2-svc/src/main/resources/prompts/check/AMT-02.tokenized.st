RULE {{rule.id}} — {{rule.name}}
Severity: {{rule.severity}} · Polarity: {{rule.polarity}} · Waivable: {{rule.waivable}}

PURPOSE
-------
Determine whether the invoice amount complies with the LC, applying the UCP 30
tolerance precedence in this order:

  (a) Explicit :39A: percentage tolerance — use that.
  (b) "about" / "approximately" on credit amount — ±10% (UCP 30(a)).
  (c) Bulk goods, no stipulated unit count — ±5% on quantity AND amount, provided
      total drawing does not exceed credit (UCP 30(b)).
  (d) Even when partial shipments forbidden — −5% on amount allowed if quantity
      shipped in full and unit price not reduced (UCP 30(c)).
  (e) Default — exact, no overdraw (UCP 18(b)).

AUTHORITY
---------
{{ref.UCP-18-b.id}} — {{ref.UCP-18-b.heading}}
"{{ref.UCP-18-b.text}}"

{{ref.UCP-30-a.id}} — {{ref.UCP-30-a.heading}}
"{{ref.UCP-30-a.text}}"

{{ref.UCP-30-b.id}} — {{ref.UCP-30-b.heading}}
"{{ref.UCP-30-b.text}}"

{{ref.UCP-30-c.id}} — {{ref.UCP-30-c.heading}}
"{{ref.UCP-30-c.text}}"

{{ref.ISBP-C9.id}} — {{ref.ISBP-C9.heading}}
"{{ref.ISBP-C9.text}}"

INPUTS
------
LC credit amount         : {{lc.credit_amount}} {{lc.credit_currency}}
About / approximately?   : {{lc.about_credit_amount}}
:39A: tolerance plus / minus : +{{lc.tolerance_plus}}% / −{{lc.tolerance_minus}}%
LC quantity expressed in    : {{lc.lc_quantity}}

Invoice total            : {{doc.INV.invoice_total}}
Invoice line items       : {{doc.INV.line_items}}

If parsed amounts disagree across docs, fall back to:
  Raw :32B: tag         : {{lc.raw.32B}}
  Raw :39A: tag         : {{lc.raw.39A}}

DECISION RULES
--------------
1. Pick the tolerance branch by priority above.
2. Compute the ceiling and (if applicable) floor for the invoice amount.
3. Compare {{doc.INV.invoice_total}} against ceiling / floor.
4. PASS if within window; FAIL if outside; DOUBTS if the LC is silent on a
   condition that would change the answer (e.g., bulk-vs-pieces ambiguous).

You MUST report which tolerance branch you applied and the computed ceiling.

OUTPUT (today: {{system.today}} · presentation: {{system.presentationDate}})
{{system.outputSchema}}
