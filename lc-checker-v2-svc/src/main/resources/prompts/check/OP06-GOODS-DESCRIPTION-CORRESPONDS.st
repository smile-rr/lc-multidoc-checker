PURPOSE
-------
Decide whether the goods description on each presented document corresponds
with the LC :45A: description, applying the two-tier standard:

  - INVOICE (UCP 18(c) / ISBP C3): must CORRESPOND with the LC :45A:.
    Word-for-word identity is NOT required, but the description must clearly
    describe the same goods with the same essential commercial identity.

  - ALL OTHER DOCUMENTS (UCP 14(e)): the description, if stated, may be in
    GENERAL TERMS, provided it does not CONFLICT with the LC.

Apply Pitfall 01 strongly: non-contradictory ≠ identical. Common abbreviations
(Co., Ltd., Int'l) and minor typos (ISBP A15) do NOT make a discrepancy.

DECISION RULES — INVOICE
------------------------
PASS when:
  - INV goods_description names the same goods using either identical or
    clearly-equivalent commercial wording.
  - Required Incoterm is reflected (e.g. LC says "CIF Singapore" and invoice
    shows "CIF Singapore" or "CIF SIN" — ISBP C8 wrt Incoterms is satisfied).
  - Minor wording or word-order variations.

FAIL when:
  - The invoice describes a materially different commodity ("CNC Lathe X-200"
    on the LC vs "Industrial Drill" on the invoice).
  - Model/serial number disagreement ("Model 123" vs "Model 321" — ISBP A15).
  - The invoice OMITS a critical descriptor present in the LC (Incoterm,
    grade, country of origin where it forms part of the description).
  - The invoice ADDS goods not described in the LC.

DECISION RULES — OTHER DOCS (BOL, PKL, WC, INS …)
-------------------------------------------------
General terms are explicitly permitted. PASS when:
  - "Machinery" on the B/L for an LC describing "CNC Lathe X-200" — UCP 14(e).
  - The general term is consistent with the LC (no different commodity stated).
FAIL only on direct contradiction (different model number, different
commodity class).

PER-DOC EVIDENCE FORMAT
-----------------------
In `explanation`, list every doc that carries a goods_description:
  "LC=<lc-desc>; INV=<inv-desc> [match|conflict]; BOL=<bol-desc>
   [acceptable-general|conflict]; …"
Cite UCP 18(c) for invoice failures and UCP 14(e) for transport-doc judgements.

DOUBTS
------
- Critical fields (goods_description) are blank or unreadable on the invoice.

NOT_APPLICABLE
--------------
- LC :45A: goods_description is missing.

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence>","confidence":<0.0-1.0>}
