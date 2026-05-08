RULE: CERT-02 — Certificate signature and form requirements

AUTHORITY
{{ref.ISBP-A12.id}} — {{ref.ISBP-A12.heading}}
"{{ref.ISBP-A12.text}}"

{{ref.ISBP-Q3.id}} — {{ref.ISBP-Q3.heading}}
"{{ref.ISBP-Q3.text}}"

TASK
Common-banking-practice DEFAULT: a certificate IS a statement document and
**must be signed** to be valid evidence on its face (UCP 14(d) "data on a
document must not conflict with itself", and ISBP A12 — every document
that requires the signature of an issuer must bear one). The LC does NOT
need to write "must be signed" explicitly; the requirement is implicit in
calling for a "certificate", "statement", "declaration", or any document
that asserts a fact.

Apply two checks in order:

  (a) Signature present? (per ISBP A12 — handwritten, facsimile,
      perforated, stamp-as-signature, or authenticated digital). A bare
      company stamp is NOT a signature on its own per ISBP Q3.
  (b) Signer matches the LC stipulation (only when LC names a specific
      signer — "signed by beneficiary", "signed by inspection agent X",
      "countersigned by shipping company"). When LC is silent on WHO,
      any plausible authorised signer satisfies (b).

EVIDENCE TO CONSIDER
- Cert `signed` flag (boolean from extraction).
- Cert `signature_party` (label/name of signer if visible).
- Cert `stamp_present` (boolean — note: stamp alone ≠ signature per Q3).
- LC :46A: / :47A: signature stipulation if any.

DECISION
- PASS  : Certificate bears a valid signature. If LC named a signer,
          signer label matches.
- FAIL  : Certificate bears no signature (or stamp-only); OR signer
          named in LC differs from the actual signer.
- DOUBTS: Signature evidence ambiguous (e.g. unclear whether the mark on
          the doc constitutes a signature, or signer label not extracted).
- NOT_APPLICABLE: Use ONLY when the certificate doc itself was not presented
          (BC or WC absent from this presentation). Do NOT use NA just
          because the LC text omits an explicit "must be signed" — the
          signature requirement is the default for certificates.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS|NOT_APPLICABLE","confidence":0.0-1.0,"explanation":"<one sentence>"}
