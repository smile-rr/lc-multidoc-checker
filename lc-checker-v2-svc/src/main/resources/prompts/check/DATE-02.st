RULE: DATE-02 — Presentation within window and before LC expiry

AUTHORITY
{{ref.UCP-14-c.id}} — {{ref.UCP-14-c.heading}}
"{{ref.UCP-14-c.text}}"

TASK
Determine whether the presentation occurred within the period stipulated by the
credit (LC :48: presentation_days, default 21 calendar days per UCP 14(c)) AND
on or before the LC expiry date (LC :31D:).

The shipment date for window calculation is determined per UCP 20(a)(ii):
  - If the BOL has an explicit on-board notation with a date, use that date.
  - Else, if the BOL is pre-printed "shipped on board", use the BOL issue date.

Use the calculateDateDiff(fromIso, toIso) tool for any day-count arithmetic.
Do not approximate.

DECISION
- PASS  : days(shipment_date → presentation_date) ≤ presentation_days
          AND presentation_date ≤ expiry_date.
- FAIL  : either window or expiry violated. State which, with both dates and
          the computed delta, quoting the raw_quote of each value.
- DOUBTS: shipment date cannot be determined (no on-board notation, no pre-
          printed shipped-on-board form, no BOL issue date).

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence quoting raw dates>"}
