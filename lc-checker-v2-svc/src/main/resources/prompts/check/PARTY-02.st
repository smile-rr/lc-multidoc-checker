RULE: PARTY-02 — BOE drawee matches LC stipulated drawee

AUTHORITY
{{ref.ISBP-A19.id}} — {{ref.ISBP-A19.heading}}
"{{ref.ISBP-A19.text}}"

{{ref.ISBP-A20.id}} — {{ref.ISBP-A20.heading}}
"{{ref.ISBP-A20.text}}"

TASK
The party on whom the draft is drawn must be the bank stipulated by the LC
in :42A: (drawee_bic — preferred), :42C: (drafts_at), or :42D: (drawee
free-format).

EVIDENCE TO CONSIDER
- BOE drawee_name (verbatim from draft "DRAWN ON: …" block).
- BOE drawee_bic (extracted BIC if any).
- LC drawee_bic (from :42A:) and/or :42D: free-text.
- Address blocks may differ in detail; tolerate per ISBP A19/A39.

PROCESS
1. If both BOE and LC have a BIC, compare BICs literally. Match → PASS.
2. Else compare bank names (case-insensitive, ignore "Bank of"/legal-form
   suffixes). Match → PASS.
3. Else compare addresses if both side names are bank-only without
   distinguishing detail. Match → PASS.
4. If clearly different banks → FAIL.

DECISION
- PASS  : BOE drawee = LC stipulated drawee (BIC, name, or address basis).
- FAIL  : drawee is a different bank, or is the applicant (UCP 6(c)
          violation — but also a discrepancy on the BOE itself).
- DOUBTS: extraction confidence low; BIC missing on both sides and bank
          name is generic.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence quoting BOE and LC drawees>"}
