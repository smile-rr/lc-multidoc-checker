RULE: CERT-02 — Certificate signature and form requirements

AUTHORITY
{{ref.ISBP-A12.id}} — {{ref.ISBP-A12.heading}}
"{{ref.ISBP-A12.text}}"

{{ref.ISBP-Q3.id}} — {{ref.ISBP-Q3.heading}}
"{{ref.ISBP-Q3.text}}"

TASK
Where the LC requires a certificate (BC or WC) to be signed — explicitly
or implicitly via "stating" + "signed" prose — the certificate must:
  (a) Bear a signature (per ISBP A35 — handwritten, facsimile,
      perforated, stamp-as-signature, or authenticated digital). A bare
      company stamp is NOT a signature on its own per ISBP Q3.
  (b) Be signed by the stipulated party if the LC names one (e.g. "signed
      by beneficiary", "signed by inspection agent X", "countersigned by
      shipping company"). The signer label must match the stipulated party.

EVIDENCE TO CONSIDER
- Cert signed flag (boolean from extraction).
- Cert signature_party (label/name of signer if visible).
- Cert stamp_present (boolean — note: stamp alone ≠ signature per Q3).
- LC :46A: / :47A: signature stipulation (read carefully — distinguish
  "signed" vs "issued by" vs "stating that…").

DECISION
- PASS  : LC requires signature, and certificate bears one; if LC names
          the signing party, the signer label matches.
- FAIL  : LC requires signature but none present (or stamp-only without
          signature mark); OR LC names signer party but signed by a
          different party.
- DOUBTS: LC stipulation is ambiguous about whether signature is required
          (e.g. just "by the beneficiary"); or signer label not extracted.
- NOT_APPLICABLE: LC stipulates no signature requirement for the cert.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS|NOT_APPLICABLE","confidence":0.0-1.0,"explanation":"<one sentence>"}
