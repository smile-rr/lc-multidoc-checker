RULE: PARTY-01 — Beneficiary and applicant identity consistent across documents

AUTHORITY
{{ref.UCP-14-j.id}} — {{ref.UCP-14-j.heading}}
"{{ref.UCP-14-j.text}}"

{{ref.ISBP-A19.id}} — {{ref.ISBP-A19.heading}}
"{{ref.ISBP-A19.text}}"

{{ref.ISBP-A20.id}} — {{ref.ISBP-A20.heading}}
"{{ref.ISBP-A20.text}}"

TASK
The beneficiary appears on multiple documents in different roles:
  - INV issuer / drawer
  - BOL shipper / consignee (when LC structure is "to order of shipper")
  - PKL issuer
  - BOE drawer
  - BC / WC issuer

The applicant appears as:
  - INV buyer / consignee
  - BOL notify-party / consignee (when LC says so)
  - And as the named party in :50: of the LC

Names and addresses must be consistent across these positions per UCP 14(j).

TOLERANCE per ISBP A19/A39:
  - Typographical variations that do not change meaning are permitted.
  - Address details need not match exactly so long as the same legal entity
    is identifiable.
  - Abbreviations ("Co." vs "Company", "Ltd." vs "Limited") are permissible.

The bar is "distinct legal entity" — a different company name (e.g.
"ACME INTERNATIONAL CORP" vs "ACME INC") fails even if related.

DECISION
- PASS  : beneficiary identifiable as same entity across docs; applicant
          identifiable as same entity. Minor typo/address variation OK.
- FAIL  : any doc names a clearly different legal entity for either party.
          Quote both renderings.
- DOUBTS: variation is non-trivial and the doc could be a related entity
          (parent, subsidiary, branch) — bank judgement needed.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence>"}
