PURPOSE
-------
Verify presentation timing under UCP 600 Art. 14(c).

A complying presentation must be made:
  (a) not later than 21 calendar days after the date of shipment (the on-board
      notation date, or the bl_date if the B/L is pre-printed "shipped on board"
      and no later notation is present), AND
  (b) not later than the LC expiry_date, AND
  (c) within any tighter window stipulated by the LC (presentation_days field —
      e.g. ":48: 15 days from B/L date" overrides the 21-day default).

You will receive:
  - shipment_date — UCP 14(c) anchor; on-board notation date wins over bl_date.
  - bl_date       — fallback anchor when shipment_date is blank.
  - expiry_date   — LC :31D: latest-presentation date.
  - presentation_days — optional :48: override (integer days from shipment).
  - presentation date is implicitly today (the date the documents are being examined).

ALGORITHM
---------
1. Pick the shipment anchor: shipment_date if present, else bl_date.
2. Compute days_from_shipment = today − anchor.
3. Allowed window = min(21, presentation_days_if_set).
4. If days_from_shipment > allowed_window → FAIL ("late presentation, UCP 14(c)").
5. If today > expiry_date                 → FAIL ("after LC expiry, UCP 14(c)").
6. Otherwise → PASS.

DOUBTS / NOT_APPLICABLE
-----------------------
- DOUBTS         — anchor date is missing or unparseable; a human must read the B/L.
- NOT_APPLICABLE — neither shipment_date nor bl_date can be located on the B/L.

PER-DOC EVIDENCE FORMAT
-----------------------
In `explanation`, give the calculated values:
  "BOL: anchor=<date>, today=<date>, days=<n>, expiry=<date>, allowed=<n>;
   verdict_basis=<UCP 14(c) — within|exceeds>"

OUTPUT
------
Respond with exactly one JSON object per the system-prompt contract:
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
