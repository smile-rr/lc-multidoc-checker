Field 46A — documents required:
{documentsRequired}

Field 47A — additional conditions:
{additionalConditions}

List every separate requirement these fields impose. For each, give:
  requirement  what must be true, in one sentence an examiner would recognise
  source       ":46A:" or ":47A:"
  severity     CRITICAL if a failure alone makes the presentation non-complying,
               MAJOR if it is a discrepancy, MINOR if it is a formality
  howToCheck   which document to look at and what to compare
  notCovered   true if this needs human judgement no standing rule could apply
  documents    the document type codes this requirement is about, as a list, using
               exactly these codes: {docCodes}
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

Return only JSON: {"requirements": [ ... ]}
