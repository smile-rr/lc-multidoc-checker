RULE: CERT-01 — Certificate content satisfies stipulating LC clauses

AUTHORITY
{{ref.UCP-14-a.id}} — {{ref.UCP-14-a.heading}}
"{{ref.UCP-14-a.text}}"

{{ref.UCP-14-f.id}} — {{ref.UCP-14-f.heading}}
"{{ref.UCP-14-f.text}}"

{{ref.ISBP-Q1.id}} — {{ref.ISBP-Q1.heading}}
"{{ref.ISBP-Q1.text}}"

{{ref.ISBP-Q3.id}} — {{ref.ISBP-Q3.heading}}
"{{ref.ISBP-Q3.text}}"

TASK
This rule covers BOTH beneficiary certificates (BC) and warranty
certificates (WC) — same logic, two trigger paths.

For each LC :46A: / :47A: clause that REQUIRES a certificate (BC or WC),
the corresponding certificate body must satisfy every condition stated in
that clause.

PROCESS
1. Identify the LC clause(s) requiring this certificate. Examples:
     ":46A: BENEFICIARY'S CERTIFICATE STATING THAT ALL DOCUMENTS HAVE BEEN
      SENT TO THE APPLICANT BY COURIER ON SAME DATE AS BL"
     ":47A: WARRANTY CERTIFICATE STATING THAT THE GOODS COMPLY WITH EU
      REGULATION 2023/45"
2. For each such clause, parse out the condition(s) the cert must literally
   make (the "stating that …" prose).
3. For each condition, examine the certificate's bc_conditions_text or
   wc_conditions_text body (verbatim). Look for explicit text that
   satisfies the condition. ISBP Q3: language need not be identical, but
   the SUBSTANCE must be unambiguous.
4. If the stipulated condition mentions a number, code, regulation, date,
   or party, the cert MUST quote it explicitly.

DECISION
- PASS  : every stipulating clause is satisfied by the certificate body.
- FAIL  : at least one stipulating clause is NOT satisfied. Quote the LC
          clause raw_quote and the cert body's nearest text (or note absence).
- DOUBTS: cert body is vague but could plausibly cover the clause; bank
          judgement needed.

OUTPUT (strict JSON, no fences):
{"verdict":"PASS|FAIL|DOUBTS","confidence":0.0-1.0,"explanation":"<one sentence; list unsatisfied clauses>"}
