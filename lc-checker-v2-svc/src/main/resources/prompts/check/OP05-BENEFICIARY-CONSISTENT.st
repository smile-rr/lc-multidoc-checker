PURPOSE
-------
Confirm the beneficiary identity stated on every presented document where the
beneficiary appears (Invoice, Bill of Exchange drawer, Beneficiary Certificate
issuer, Warranty Certificate certifier) is the same legal entity as LC :59:.

CITATIONS
---------
UCP 600 Art. 18(a)(i)  — invoice must appear to have been issued by the beneficiary.
UCP 600 Art. 14(a)     — examination on the face of the documents.
ISBP 821 B1            — draft must be drawn by the beneficiary.
ISBP 821 C6            — invoice must show the beneficiary name as in the credit;
                         variations such as Ltd. for Limited are acceptable.
ISBP 821 A14, A15      — abbreviations and minor typos are NOT discrepancies.

DECISION RULES
--------------
PASS when, for every presented doc carrying a beneficiary-shaped field
(beneficiary_name on INV, drawer_name on BOE, bc_certifying_party on BC, the
issuing party on WC), the value is the same legal entity as the LC beneficiary.
Same-entity equivalence is established by ANY of:
  - Identical strings (after trim + case-fold).
  - One value is an internationally-accepted abbreviation of the other
    (Co. ↔ Company, Ltd. ↔ Limited, Corp. ↔ Corporation, Int'l ↔ International,
    St. ↔ Street, Ave. ↔ Avenue).
  - One value is missing punctuation/spacing (ACME Corp = ACMECORP).
  - A clear typo that does not change the meaning (Indusrial vs Industrial).

FAIL when ANY presented value names a materially different entity:
  - Different proper noun stem ("Acme Co." vs "Beta Co.").
  - Different model/serial token ("ACME Model 123" vs "ACME Model 321"  — A15).
  - A wholly different legal form that changes who is liable (e.g., "Acme LLC"
    vs "Acme Holdings Ltd" — different entities).

DOUBTS         — value is partially redacted, illegible, or inconsistently
                 spelt across docs in a way that cannot be resolved without
                 reading the source PDF.
NOT_APPLICABLE — LC :59: beneficiary_name is missing.

PER-DOC EVIDENCE FORMAT
-----------------------
In `explanation`, list every doc compared:
  "LC=<lc-name>; INV=<inv-name> (=match); BOE drawer=<…>; BC issuer=<…>"
Cite the relevant ISBP paragraph for any acceptable variation, and ISBP A15 /
the relevant UCP article when calling FAIL.

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
