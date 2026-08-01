List every separate requirement fields 46A and 47A impose on this presentation.

For each one, give:

  requirement  what must be true, in one sentence an examiner would recognise
  source       ":46A:" or ":47A:"
  severity     CRITICAL if a failure alone makes the presentation non-complying,
               MAJOR if it is a discrepancy, MINOR if it is a formality
  howToCheck   which document to look at and what to compare
  rule         a condition the examination can settle by comparing fields, or null.
               See "COMPILING A CONDITION" below — this is the important one.
  notCovered   true only when nothing testable covers it: the requirement needs a
               person to look at the documents and form a view. Leave it false
               whenever you were able to write a `rule`, and false when an examiner
               reading the pages could settle it against the credit.
  documents    the document type codes this requirement is about, as a list, using
               exactly the codes given above.
               Empty when the requirement names no particular document.
  attestations the properties of the page — rather than of its text — that this
               requirement demands. A list drawn only from:
                 signed                  it must be signed, however worded
                 seal_present            a seal, chop or stamp is demanded
                 legalisation_present    legalised, visaed, or stamped by a chamber
                                         of commerce, consulate or embassy
                 original_marking        an original is demanded, or a stated number
                                         of originals or copies
                 endorsement_present     it must be endorsed
               Empty for a requirement about what a document says rather than about
               how it is executed.

`attestations` matters because reading those needs a second look at the scan, and
that look is only taken where something asks for it. "Certificate of origin signed
and stamped by the chamber of commerce" is `documents: ["COO"]` with
`attestations: ["signed", "seal_present", "legalisation_present"]`. "Invoice to show
the credit number" is `documents: ["INV"]` with `attestations: []`.


COMPILING A CONDITION

Most of what a credit demands is a comparison, not a reading. Where it is, write it
out as a `rule`: the examination then settles it by comparing what was extracted, the
officer sees both values and the operator that joined them, and it answers the same
way every time it is run. That is a stronger form of evidence than a view somebody
formed, and it is the form a refusal notice can be defended on. Where the requirement
is genuinely a reading, leave `rule` null and an examiner takes it. Both are correct
answers. Claiming a comparison you cannot actually express is not.

The shape:

  "rule": {"groups": [{"logic": "all", "rows": [
      {"id": "r1", "op": "contains",
       "l": {"doc": "INV", "field": "goods_description"},
       "r": {"literal": "LC-2024-0031"}}
  ]}]}

  logic     "all" — every row must hold — or "any"
  l, r      an operand: {"doc": CODE, "field": KEY} using only the document codes
            and field keys listed above, for that document. The right-hand side may
            instead be {"literal": "..."} for a value stated in the credit itself.
  op        one of the operators listed above, and nothing else
  tol       for within_pct and d_within only: the number, as a string

Write a rule when the requirement compares two things that are both extracted, or
compares one extracted thing against a value the credit states. Examples:

  "Invoice must show the credit number"
      contains — INV goods_description against the credit number as a literal

  "Beneficiary name on all documents to agree with field 59"
      one row per document, eq against LC beneficiary

  "Drafts to be drawn at 90 days sight"
      eq — BOE tenor against "90 DAYS SIGHT" as a literal

Leave `rule` null when the requirement asks for a judgement — whether a description
"corresponds", whether two addresses are the same place, whether a document is
"acceptable" — or when what it names is not in the field list above. Do not reach for
a near-enough field: a comparison reading a field nothing extracts is rejected, and
the requirement is judged anyway with a worse explanation attached.

Be literal about what the credit says. Do not merge two conditions because they are
related, and do not add market practice the credit did not state.

Return only JSON: {"requirements": [ ... ]}
