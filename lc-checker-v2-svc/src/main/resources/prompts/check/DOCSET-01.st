RULE: DOCSET-01 — Every required document is presented

AUTHORITY
{{ref.UCP-14-a.id}} — {{ref.UCP-14-a.heading}}
"{{ref.UCP-14-a.text}}"

{{ref.UCP-14-f.id}} — {{ref.UCP-14-f.heading}}
"{{ref.UCP-14-f.text}}"

{{ref.ISBP-A1.id}} — {{ref.ISBP-A1.heading}}
"{{ref.ISBP-A1.text}}"

TASK
This rule owns the missing-required-doc concern. Every other rule that needs
a missing doc as input records NOT_APPLICABLE; only this rule reports the
missing-doc as a discrepancy.

For each item in LC :46A: documents_required (and any doc requirement embedded
in :47A: additional_conditions), determine whether a presented document
satisfies it:
  - Direct label match (e.g. "Commercial Invoice" ≡ INV).
  - Form equivalence per UCP 14(f) (e.g. "Form A" satisfies a Certificate
    of Origin requirement; ISBP A1 form/issuer/content stipulations).
  - Stipulated form (signed by X / countersigned / legalised) — the
    form-discharge check belongs to CERT-02 and similar; here we only
    decide whether SOME presented document fulfils the requirement label.

Implicit doc requirements (e.g. :41A:/:41D: "available by negotiation of
beneficiary's drafts" → BOE required) must be considered.

The set of presented doc types is provided in the evidence block.

DECISION
- PASS  : every requirement is satisfied by at least one presented document.
- FAIL  : at least one requirement has no satisfying document. List each
          unsatisfied requirement with its raw_quote from :46A: / :47A:.
- DOUBTS: a label could plausibly map to more than one presented document
          and the LC stipulation is ambiguous; or :47A: prose is unclear
          whether a document is required.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence; list missing/ambiguous items>"}
