RULE {{rule.id}} — {{rule.name}}
Severity: {{rule.severity}} · Polarity: {{rule.polarity}} · Waivable: {{rule.waivable}}

PURPOSE
-------
Verify the bill of lading is "clean" under UCP 600 Art. 27 and ISBP 821 D25.

A B/L is clean when it bears NO clause or notation expressly declaring a
defective condition of the goods or their packaging. The word "clean" need
not appear.

AUTHORITY (golden source — injected verbatim from refs registry)
----------------------------------------------------------------
{{ref.UCP-27.id}} — {{ref.UCP-27.heading}}
"{{ref.UCP-27.text}}"

{{ref.ISBP-D25.id}} — {{ref.ISBP-D25.heading}}
"{{ref.ISBP-D25.text}}"

INPUT (from this presentation)
------------------------------
B/L clean indicator (parsed): {{doc.BOL.clean_indicator}}

Off-schema notations on the B/L (raw text the extractor flagged):
{{doc.BOL.off_schema}}

If the parsed indicator is null or the off-schema text is contradictory,
fall back to the full extracted text:
{{doc.BOL.fullText}}

DECISION RULES
--------------
PASS when clean_indicator = true AND no off-schema item describes a defect,
damage, shortage, dirtiness, or staining of the goods or packaging.

Acceptable clauses that DO NOT make the B/L unclean (per ISBP D25):
  "shipper's load and count"
  "said to contain"
  "weight, measure, quality, condition unknown"
  "unprotected" (when describing goods of that nature)

FAIL when ANY of the following appear, even struck-through without authentication:
  - A clause expressly declaring goods/packaging defective
    ("DAMAGED", "STAINED", "DIRTY", "DEFECTIVE", "BROKEN", "TORN BAGS")
  - A shortage notation ("3 cases short shipped")
  - An overstamp marking the document UNCLEAN

DOUBTS         — extracted text is ambiguous ("minor scratches noted on packaging").
NOT_APPLICABLE — never (rule only fires when BOL is present).

OUTPUT (today: {{system.today}} · presentation: {{system.presentationDate}})
{{system.outputSchema}}
