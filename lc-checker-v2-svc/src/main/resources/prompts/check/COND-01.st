PURPOSE
-------
Decide whether the Beneficiary's Certificate (BC) presented satisfies EVERY
discrete requirement the LC :46A: (DOCUMENTS REQUIRED) and :47A: (ADDITIONAL
CONDITIONS) place on that certificate.

A BC clause is a single verifiable requirement: who issues it, what it must
state, what it must reference, and how it must be signed/certified.

CITATIONS
---------
UCP 600 Art. 14(f) — for documents not specified by name, content fulfilling
                     the function of the required document is acceptable.
ISBP 821 Q1        — every condition stated for a certificate must be
                     addressed in the document.
ISBP 821 Q2        — a certificate must be issued by the entity stated.
ISBP 821 Q3        — a signed certificate must bear a handwritten or
                     authenticated signature; a stamp/seal alone is NOT enough.
ISBP 821 Q4        — references to other documents (numbers/dates) must match.
ISBP 821 Q5        — data on the BC must not conflict with other docs/credit.

INPUTS (already inlined in the user prompt)
-------------------------------------------
- documents_required     — :46A: clauses (look only at the BC-targeted ones)
- additional_conditions  — :47A: clauses that touch the BC
- bc_conditions_text     — verbatim certifying text on the BC
- bc_certifying_party    — who is certifying

ALGORITHM
---------
1. From :46A: + :47A: extract atomic BC requirements. Number them C1, C2, …
   (e.g. C1 "issued by beneficiary", C2 "states goods inspected pre-shipment",
   C3 "must quote LC number").
2. For each requirement, locate evidence in bc_conditions_text /
   bc_certifying_party. Apply ISBP A14 (abbreviations) and A15 (typos that
   don't change meaning) — minor wording variation is acceptable.
3. Per-requirement verdict:
     PASS  — evidence is present and matches the requirement.
     FAIL  — evidence is missing, contradicts the requirement, or differs in
             a meaning-changing way (party, scope, value).
     DOUBT — clause genuinely ambiguous, or required text not extractable.
4. Aggregate:
     PASS           — every requirement is PASS.
     FAIL           — at least one requirement is FAIL.
     DOUBTS         — no FAILs but at least one DOUBT.
     NOT_APPLICABLE — :46A: and :47A: place NO requirement on a BC.

EVIDENCE FORMAT
---------------
Summary sentence + per-clause verdicts:
  "C1 ✓ issued by beneficiary; C2 ✓ states pre-shipment inspection;
   C3 ✗ LC number 'LCWIDG-2023-0317' on cert vs ':20:' = 'LCWIDG-2024-0317'
   → FAIL (ISBP Q4)."

OUTPUT
------
Single JSON object per the system-prompt contract:
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<summary + per-clause line>","confidence":<0.0-1.0>}
