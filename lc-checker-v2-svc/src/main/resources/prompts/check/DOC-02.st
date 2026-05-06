PURPOSE
-------
Decide whether the bill of lading (B/L) is "clean" — i.e. bears no clause or
notation that EXPRESSLY declares a defective condition of the goods or their
packaging.

CITATIONS
---------
UCP 600 Art. 27 — banks accept only a clean transport document. The word
                  "clean" need NOT appear on the document.
ISBP 821 D25    — clauses expressly declaring a defective condition make the
                  document unclean. Common clauses that DO NOT make a B/L
                  unclean: "shipper's load and count", "said by shipper to
                  contain", "packaging may not be sufficient for sea voyage"
                  (a forward-looking caveat — not an actual defect).

INPUTS (already inlined in the user prompt)
-------------------------------------------
- clean_indicator — the extracted "is the B/L clean?" signal from vision
                    extraction. May be true / false / null / a quoted clause.

DECISION RULES
--------------
PASS — clean_indicator is true, OR the field is null and no defect clause
       is reported. Absence of a clean stamp is NOT a discrepancy (UCP 27).

FAIL — the B/L bears any clause expressly declaring a defective condition
       of goods or packaging. Concrete examples (any of these = FAIL):
         "PACKAGES TORN", "BOXES CRUSHED", "GOODS WET", "DAMAGED",
         "RUSTED", "STAINED", "X CARTONS SHORT", "BROKEN",
         "ONE PALLET LEAKING", "PACKAGES IN POOR CONDITION".

DOUBTS — a clause is present whose meaning is genuinely ambiguous and a
         senior officer would escalate (e.g. partially redacted text, an
         unusual notation that may or may not declare a defect).

NOT_APPLICABLE — never applicable here; if a B/L is presented the rule
                  always evaluates to PASS / FAIL / DOUBTS.

POLARITY NOTE
-------------
This rule is polarity NEGATIVE — its trigger is "the B/L is clean", and
FAIL means "an unclean clause is present". State the offending clause
verbatim in the explanation when returning FAIL.

EVIDENCE FORMAT
---------------
"PASS — no defective-condition clause on B/L (UCP 600 Art. 27)."
"FAIL — B/L bears 'PACKAGES TORN' clause; UCP 600 Art. 27 / ISBP D25."

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence with evidence + UCP/ISBP cite>","confidence":<0.0-1.0>}
