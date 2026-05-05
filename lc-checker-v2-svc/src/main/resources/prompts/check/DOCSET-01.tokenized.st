RULE {{rule.id}} — {{rule.name}}
Severity: {{rule.severity}} · Polarity: {{rule.polarity}} · Waivable: {{rule.waivable}}

PURPOSE
-------
Determine whether every document required by the credit's :46A: list (and any
additional document requirements stated in :47A:) has been presented. A
missing required document is, by itself, a critical discrepancy — never PASS
silently.

AUTHORITY
---------
{{ref.UCP-14-a.id}} — {{ref.UCP-14-a.heading}}
"{{ref.UCP-14-a.text}}"

{{ref.ISBP-A1.id}} — {{ref.ISBP-A1.heading}}
"{{ref.ISBP-A1.text}}"

INPUTS
------
LC :46A: required-document list (parsed):
{{lc.documents_required}}

LC :47A: additional conditions (parsed; may stipulate documents):
{{lc.fullText}}

Doc types actually presented in this presentation:
{{lc.presented_doc_types}}

DECISION RULES
--------------
For each item in {{lc.documents_required}}:

  PASS the item when a presented document clearly matches by:
    (a) the same label (e.g. "Commercial Invoice" ↔ INV)
    (b) a universally accepted equivalent (e.g. "Form A" satisfies
        "Certificate of Origin" issued under the GSP), per UCP 14(f).
    (c) explicit LC text indicating equivalence.

  FAIL the item when no presented document corresponds to it.

  DOUBTS the item only when:
    - the LC label is ambiguous and could plausibly map to more than one
      presented document, OR
    - the LC stipulates a document via :47A: prose without naming it as a
      required doc, OR
    - a presented document might satisfy the requirement but its function
      cannot be confirmed from its face (UCP 14(f) edge cases).

OVERALL VERDICT
---------------
  - PASS  : every required item passes (no FAIL, no DOUBTS).
  - FAIL  : any required item fails. Report the missing labels in
            "missing_docs". Do NOT downgrade to DOUBTS just because the
            LC list is long; absence is absence.
  - DOUBTS: at least one item is in DOUBTS, and none is FAIL. The officer
            must confirm equivalence or the missing-doc determination.

You MUST report each unmatched required label in "missing_docs".

OUTPUT
------
{{system.outputSchema}}
