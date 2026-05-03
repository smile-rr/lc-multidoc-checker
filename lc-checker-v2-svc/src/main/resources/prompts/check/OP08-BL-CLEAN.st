PURPOSE
-------
Verify the bill of lading is "clean" under UCP 600 Art. 27 and ISBP 821 D25.

A B/L is clean when it bears NO clause or notation expressly declaring a
defective condition of the goods or their packaging. The word "clean" need
not appear (UCP 27 final sentence).

POLARITY: NEGATIVE — finding a defect/damage notation IS the discrepancy.

INPUT SIGNAL
------------
clean_indicator (boolean from extraction). Off-schema items on the B/L (stamps,
corrections, hand-written annotations) are also injected into your reasoning
context where present.

DECISION RULES
--------------
PASS when:
  - clean_indicator = true AND no off-schema item describes a defect, damage,
    shortage, dirtiness, or staining of the goods/packaging.
  - Acceptable clauses that DO NOT make the B/L unclean:
      "shipper's load and count"
      "said to contain"
      "weight, measure, quality, condition unknown"
      "unprotected" (when describing goods of that nature)
    These are explicitly permitted by UCP 26 / ISBP D25.

FAIL when ANY of the following appear, even struck-through without
authentication:
  - A clause expressly declaring the goods or packaging defective
    ("DAMAGED", "STAINED", "DIRTY", "DEFECTIVE", "BROKEN", "TORN BAGS").
  - A shortage notation ("3 cases short shipped").
  - An overstamp marking the document UNCLEAN.

DOUBTS         — extracted text is ambiguous (e.g. "minor scratches noted on
                 packaging" — borderline; bank policy may differ).
NOT_APPLICABLE — never (rule only fires when BOL is present).

PER-DOC EVIDENCE FORMAT
-----------------------
"BOL: clean_indicator=<t|f>; flagged_clauses=[…]; verdict_basis=UCP 27 / ISBP D25"

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
