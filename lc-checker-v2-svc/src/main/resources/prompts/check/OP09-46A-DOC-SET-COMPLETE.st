PURPOSE
-------
Verify the documents PRESENTED in this session cover every document the LC's
:46A: requires, and that originals counts (where stipulated) are met.

CITATIONS
---------
UCP 600 Art. 14(f) — banks accept a non-stipulated document if it appears to
                     fulfil the function of the required document.
UCP 600 Art. 17    — at least one ORIGINAL of each stipulated document must
                     be presented.
ISBP 821 A1        — examine documents in their entirety.
ISBP 821 A27/A28   — original-vs-copy semantics.

INPUTS
------
- documents_required: the verbatim :46A: text from the LC, listing the docs
  required (e.g., "1. Signed commercial invoice in 3 originals; 2. Full set
  3/3 of clean on-board ocean B/L; 3. Packing list in 2 copies; 4. Beneficiary
  certificate; 5. Warranty certificate.").
- originals_required / originals_presented when extracted.
- The session's actual presented doc-type set is shown in the "Document
  fields" block of this prompt (one line per presented type).

ALGORITHM
---------
1. Parse :46A: to enumerate every required document; for each, capture:
     - the doc name (commercial invoice / B/L / packing list / etc.)
     - whether the LC asks for ORIGINAL(s) and how many (e.g. "in 3 originals",
       "full set 3/3").
2. Map each requirement to a presented doc type:
     INV ↔ commercial invoice
     BOL ↔ ocean / marine bill of lading
     PKL ↔ packing list / weight & packing list
     BOE ↔ draft / bill of exchange
     BC  ↔ beneficiary certificate
     WC  ↔ warranty / quality certificate
     INS ↔ insurance policy / certificate
     COO ↔ certificate of origin
3. FAIL if any required doc has no corresponding presented type.
4. FAIL if originals_required > originals_presented for any doc (when both
   extracted).
5. PASS only when every requirement is satisfied.

DECISION RULES
--------------
PASS           — every required doc is covered by a presented doc type AND
                 originals counts are satisfied where extracted.
FAIL           — at least one required doc is missing OR an originals shortfall
                 is present.
DOUBTS         — :46A: phrasing is ambiguous and a senior officer would need
                 to read the LC.
NOT_APPLICABLE — :46A: is empty (no documents stipulated).

PER-DOC EVIDENCE FORMAT
-----------------------
In `explanation`, emit a per-requirement table fragment, e.g.:
  "required=[INV*3orig ✓, BOL full-set ✓, PKL ✓, BC ✗ MISSING, WC ✓];
   verdict_basis=UCP 14(f)/17"

Always cite UCP 14(f) or 17 (or both) when calling FAIL.

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
