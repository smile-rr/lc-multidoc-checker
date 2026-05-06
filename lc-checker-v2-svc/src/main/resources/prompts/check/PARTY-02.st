PURPOSE
-------
Decide whether the beneficiary name appearing on each presented document is
consistent with the LC :59: beneficiary, applying ISBP A14/A15/A23 leniency
for legal-form abbreviations, minor typos, and address variations that do
NOT create a different legal entity.

CITATIONS
---------
UCP 600 Art. 14(a) — examine documents on face for complying presentation.
UCP 600 Art. 14(d) — data must not conflict across docs and the credit.
ISBP 821 A14       — internationally accepted abbreviations are acceptable:
                     Ltd., Co., Corp., Int'l, Mfg., St., Ave., Rd.
ISBP 821 A15       — a misspelling or typing error that doesn't affect the
                     meaning is NOT a discrepancy. "Indusrial" for
                     "Industrial" is fine; "Model 123" vs "Model 321" is NOT.
ISBP 821 A23       — beneficiary name on documents need not match exactly
                     so long as variations do not create a different legal
                     entity.

INPUTS (already inlined in the user prompt)
-------------------------------------------
- LC :59: beneficiary_name              (golden-source name)
- INV.beneficiary_name (or invoice_issuer / seller_name when extracted)
- BOL.shipper_name      (B/L shipper is treated as beneficiary candidate)
- BC.beneficiary_name   (when BC presented)
- WC.beneficiary_name   (when WC presented)

EQUIVALENCE PRINCIPLES (apply in order — most-permissive first)
---------------------------------------------------------------
1. Whitespace, case, punctuation differences are IGNORED.
   "ACME APPAREL CO LTD" == "Acme Apparel Co., Ltd."
2. ISBP A14 abbreviations are interchangeable.
   "Ltd." ≡ "Limited"; "Co." ≡ "Company"; "Corp." ≡ "Corporation";
   "Int'l" ≡ "International"; "Mfg." ≡ "Manufacturing".
3. ISBP A15 typos that don't change meaning are tolerated.
   "Indusrial Avenue" ≡ "Industrial Avenue"; "WIDGET EXPROTS" ≡
   "WIDGET EXPORTS". Single-character swap inside a long word is OK.
4. Trailing legal-form addition / removal is OK if the core name matches.
   "ACME" on one doc and "ACME APPAREL CO LTD" on another is acceptable
   under ISBP A23 only when no other doc shows a competing legal entity.
5. Address differences ALONE are not discrepancies — different addresses
   for the same legal name (head office vs branch) do not fail this rule.

DISCREPANT (FAIL) when ANY:
- Different legal entity. "Acme Inc." vs "Acme LLC" → FAIL (different
  legal form on a name with no obvious common parent).
- Different name root. "Widget Exports" vs "Wedge Imports" → FAIL.
- One doc shows the LC beneficiary, another shows a third party with
  no apparent corporate relationship.

DOUBT — name appears partially redacted, illegible, or uses an
        ambiguous abbreviation that could resolve to multiple entities.

TOOL USAGE (AGENTIC tier — multi-turn budget)
---------------------------------------------
The user prompt states the turn budget. Most cases resolve in turn 1 from
inlined fields; only call tools (getDocField / getDocInventory) when:
  - the inlined field is null and another extraction may carry the name;
  - you suspect an alternate field name (e.g. "shipper" vs "consignor")
    might have been populated by the extractor.
Spend tool calls in PARALLEL in the FIRST turn when needed; emit terminal
JSON in a later turn.

DECISION RULES (aggregate verdict)
----------------------------------
PASS           — every presented document carries a name equivalent to
                 :59: beneficiary under the equivalence principles above.
FAIL           — at least one document carries a clearly different legal
                 entity.
DOUBTS         — at least one document name is genuinely ambiguous.
NOT_APPLICABLE — :59: beneficiary_name absent (the trigger guard should
                 have caught this; if not, return NA).

EVIDENCE FORMAT
---------------
"PASS — INV 'Acme Apparel Co Ltd' ≡ LC :59: 'ACME APPAREL CO LTD';
BOL 'Acme Apparel Co., Ltd.' ≡ same (ISBP A14/A23)."
"FAIL — INV 'Widget Exports Pte Ltd' matches :59:; BOL shipper
'Wedge Imports Inc.' is a different entity (ISBP A23 / UCP 14(d))."

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<per-doc summary + ISBP/UCP cite>","confidence":<0.0-1.0>}
