RULE {{rule.id}} — {{rule.name}}
Severity: {{rule.severity}} · Polarity: {{rule.polarity}} · Waivable: {{rule.waivable}}

PURPOSE
-------
Identify any correction or alteration on a presented document and decide
whether it requires authentication under ISBP A9 / A10.

  - Documents issued by parties OTHER than the beneficiary (carrier, inspector,
    customs, chamber, insurer): corrections must appear authenticated by the
    issuer or someone authorised by the issuer (ISBP A9).
  - Documents issued by the BENEFICIARY (with the exception of drafts):
    corrections need NOT be authenticated (ISBP A10).
  - Drafts: corrections always require authentication.

AUTHORITY
---------
{{ref.ISBP-A9.id}} — {{ref.ISBP-A9.heading}}
"{{ref.ISBP-A9.text}}"

{{ref.ISBP-A10.id}} — {{ref.ISBP-A10.heading}}
"{{ref.ISBP-A10.text}}"

INPUTS
------
For each presented document, the extractor flagged any visible corrections,
strike-throughs, overwrites, or hand-written annotations to data fields.

Documents and flags:
  INV  — issuer kind: beneficiary
         corrections present: {{doc.INV.corrections_present}}
         authenticated:       {{doc.INV.corrections_authenticated}}
  BOL  — issuer kind: third-party (carrier)
         corrections present: {{doc.BOL.corrections_present}}
         authenticated:       {{doc.BOL.corrections_authenticated}}
  PKL  — issuer kind: usually beneficiary (verify per LC)
         corrections present: {{doc.PKL.corrections_present}}
         authenticated:       {{doc.PKL.corrections_authenticated}}
  BC   — issuer kind: per LC :46A: stipulation
         corrections present: {{doc.BC.corrections_present}}
         authenticated:       {{doc.BC.corrections_authenticated}}
  BOE  — issuer kind: beneficiary, BUT drafts always need authentication
         corrections present: {{doc.BOE.corrections_present}}
         authenticated:       {{doc.BOE.corrections_authenticated}}

If correction status is unclear from the parsed flags, examine the relevant
document's raw text:
  {{doc.BOL.fullText}}

DECISION
--------
PASS when:
  - No corrections present on any document, OR
  - Every correction on a third-party document is authenticated, AND
  - Every correction on a draft is authenticated.

FAIL when:
  - Any unauthenticated correction on a third-party document.
  - Any unauthenticated correction on a draft.

DOUBTS when correction is visible but the authentication mark is ambiguous
(faded stamp, partial signature).

OUTPUT
------
{{system.outputSchema}}
