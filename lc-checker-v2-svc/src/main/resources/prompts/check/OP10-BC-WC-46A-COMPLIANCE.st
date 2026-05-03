PURPOSE
-------
Verify that any presented Beneficiary Certificate (BC) and/or Warranty
Certificate (WC) satisfies EVERY condition stated for it in LC :46A:/:47A:.

CITATIONS
---------
UCP 600 Art. 14(f) — for documents not specified in detail, content must
                     fulfil the function of the required document.
ISBP 821 Q1        — every condition stated in the credit for a certificate
                     must be addressed in the document.
ISBP 821 Q2        — issuer compliance.
ISBP 821 Q3        — signature requirement.
ISBP 821 Q4        — cross-references (LC number, invoice number, B/L number)
                     must match the actual referenced documents.
ISBP 821 Q5        — data must not conflict with other docs / the credit.
Pitfall 11         — :46A:/:47A: wording must be matched EXACTLY (timeframes,
                     scope, party identity).

INPUTS
------
- documents_required + additional_conditions — :46A: / :47A: verbatim text.
- bc_conditions_text — verbatim text on the presented BC.
- wc_conditions_text + wc_scope + wc_period — verbatim WC content.
- bc_certifying_party — issuer identity on the BC.

ALGORITHM (apply independently to each presented certificate)
-------------------------------------------------------------
1. Extract from :46A:/:47A: the discrete requirements that pertain to BC / WC
   (e.g. "Beneficiary's certificate certifying that one set of non-negotiable
   shipping documents has been couriered to the applicant within 5 days of
   B/L date.").
2. For each requirement, scan bc_conditions_text / wc_conditions_text and
   confirm it is addressed:
     - Same party (e.g. couriered TO applicant — not to issuing bank).
     - Same timeframe (5 days vs 7 days = FAIL — Pitfall 11).
     - Same scope (one set vs full set).
     - Cross-references (invoice number, B/L number, LC number) match the
       actual documents in this session — ISBP Q4.
3. Verify the certifying_party / WC issuer matches LC requirements (ISBP Q2).
4. Confirm the certificate is signed where the LC stipulates a signed
   certificate (ISBP Q3 — stamp alone is NOT a signature).

DECISION RULES (one verdict for the op covering BOTH certs)
-----------------------------------------------------------
PASS           — every applicable :46A:/:47A: condition is explicitly and
                 correctly certified in EACH presented certificate.
FAIL           — any condition is unaddressed, addressed with different scope
                 or timeframe, or any referenced document number is wrong.
                 Per-cert reasoning lives in `explanation`.
DOUBTS         — certificate text is partially redacted, illegible, or :46A:
                 phrasing is genuinely ambiguous.
NOT_APPLICABLE — neither :46A: nor :47A: states a condition relevant to BC/WC.

PER-DOC EVIDENCE FORMAT
-----------------------
Emit one bullet per certificate, listing each condition with its result:
  "BC: [cond1 ✓; cond2 ✗ timeframe(7d≠5d); cond3 ✓] · issuer=<…>;
   WC: [cond1 ✓; cond2 ✓; cond3 ✗ wrong invoice no.];
   verdict_basis=UCP 14(f) / ISBP Q1-Q5"

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence with per-cert evidence>","confidence":<0.0-1.0>}
