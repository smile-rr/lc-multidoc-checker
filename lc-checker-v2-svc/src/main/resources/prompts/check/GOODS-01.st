RULE: GOODS-01 — Invoice goods description corresponds to :45A:

AUTHORITY
{{ref.UCP-18-c.id}} — {{ref.UCP-18-c.heading}}
"{{ref.UCP-18-c.text}}"

{{ref.UCP-14-e.id}} — {{ref.UCP-14-e.heading}}
"{{ref.UCP-14-e.text}}"

{{ref.ISBP-C3.id}} — {{ref.ISBP-C3.heading}}
"{{ref.ISBP-C3.text}}"

{{ref.ISBP-A19.id}} — {{ref.ISBP-A19.heading}}
"{{ref.ISBP-A19.text}}"

TASK
Determine whether the invoice goods_description "corresponds to" the LC
:45A: goods_description per UCP 18(c).

ISBP C3 elaborates: "corresponds to" does not mean character-by-character
identical. The invoice may legitimately add details (model, grade, batch,
dimensions) that are NOT in the LC. The invoice MUST NOT contradict the LC
description (different commodity, grade, model number, country of origin,
etc.).

ISBP A19 admits typographical variations that do not change meaning
(e.g. "Widgts Grade A" instead of "Widgets Grade A").

Carve-out — UCP 14(e): this rule is INVOICE-ONLY. Other documents (PKL,
BOL) need only "not be inconsistent with" the LC description; that is
covered by XD-02. Do NOT apply this rule to PKL/BOL goods descriptions.

EVIDENCE TO CONSIDER
- LC :45A: goods_description (verbatim) — provided in fields.
- INV goods_description (verbatim) — provided in fields.
- INV off_schema_items[] — extra goods clauses on page 2+ of the invoice
  that may carry additional or contradictory details.

DECISION
- PASS  : invoice description matches LC :45A: in substance, with at most
          additional details and/or typographical variation per ISBP A19.
- FAIL  : invoice description contradicts LC :45A: (different model,
          grade, commodity, etc.). Quote both descriptions in the
          explanation.
- DOUBTS: the variation is non-trivial and could plausibly read either way
          (e.g. "Widgets Grade A" vs "Widgets, premium quality").

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence quoting both>"}
