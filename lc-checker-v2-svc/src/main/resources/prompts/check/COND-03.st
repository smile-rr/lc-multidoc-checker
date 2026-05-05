PURPOSE
-------
Verify that EVERY discrete additional condition stated in LC :47A: is
satisfied somewhere in the presented document set. A :47A: clause may target
the invoice, B/L, packing list, draft, or a certificate — your job is to
identify the target doc(s) for each clause and confirm the evidence is
present and non-conflicting.

This rule complements COND-01 (BC vs :47A:) and COND-02 (WC vs :47A:),
which only audit certificates. COND-03 covers clauses that target the
commercial / transport docs, plus cross-cutting clauses ("all docs must
show LC number", "shipping marks per Annex A", etc.).

CITATIONS
---------
UCP 600 Art. 14(a) — examine documents on face for complying presentation.
UCP 600 Art. 14(d) — data must not conflict across docs and the credit.
UCP 600 Art. 14(f) — content must fulfil the function of the required doc.
UCP 600 Art. 14(h) — condition without a stipulated document → disregard.
ISBP 821 A1        — careful, holistic reading of the credit and docs.
ISBP 821 Q1        — every condition stated must be addressed.
ISBP 821 Q5        — data must not conflict.

INPUTS
------
- additional_conditions — :47A: verbatim text from the LC (primary input).
- documents_required    — :46A: required-doc list (context only — soft-doc
                           clauses there are covered by COND-01/02/DOC-04).
- Tools available (call as needed; one call per clause is normal):
    * getLcField(sessionId, fieldKey)
    * getDocField(sessionId, docType, fieldKey)
    * getDocInventory(sessionId)
    * listPresentedDocs(sessionId)
    * datesDifference(fromIso, toIso)

ALGORITHM
---------
1. Decompose :47A: into atomic clauses. A clause is one verifiable
   requirement, e.g. "Invoice must show contract no. ABC-123",
   "All documents must bear LC number", "Freight must be prepaid",
   "Shipping marks: 'XYZ-CN'". Number them C1, C2, …
2. Skip clauses already covered by other rules (the Examine stage runs them
   independently); examples:
     - BC / WC content compliance      → COND-01 / COND-02
     - Goods description vs :45A:       → GOODS-01
     - Beneficiary name consistency     → PARTY-02
     - On-board notation                → SHIP-01
     - Incoterms vs B/L freight         → SHIP-03
   Mark these as "deferred" and DO NOT re-judge them here.
3. For each remaining clause:
   a. Classify the target doc(s) — INV / BOL / PKL / BOE, or "ALL" for
      cross-cutting requirements.
   b. Identify the field(s) that would carry the evidence.
   c. Call getDocField (or use already-extracted context) to retrieve the
      value(s). Use getDocInventory when you need to know which docs are
      actually presented.
   d. Decide PASS / FAIL / DOUBT for that clause:
        PASS  — evidence is present and matches the clause exactly enough
                under ISBP A14/A15 (abbreviations and minor typos OK; data
                meaning must not change).
        FAIL  — evidence is missing, contradicts the clause, or differs in
                a meaning-changing way (timeframe, party, scope, value).
        DOUBT — clause is genuinely ambiguous, or required evidence is
                redacted / not extractable.
4. Apply UCP 14(h): if a clause names no document at all and cannot be
   reasonably mapped to one, mark it "disregarded" — neither PASS nor FAIL.

DECISION RULES (aggregate verdict)
----------------------------------
PASS           — every non-deferred, non-disregarded clause is PASS.
FAIL           — at least one non-deferred clause is FAIL.
DOUBTS         — no FAILs, but at least one non-deferred clause is DOUBT.
NOT_APPLICABLE — :47A: is empty, or every clause is deferred / disregarded.

EVIDENCE FORMAT (in `explanation`)
----------------------------------
One sentence summary, then per-clause verdicts:
  "C1[INV] ✓ contract no. ABC-123 on invoice; C2[ALL] ✓ LC number on all 4
   docs; C3[BOL] ✗ B/L marked 'freight collect' (clause: freight prepaid);
   C4[BOL] deferred → SHIP-01; C5 disregarded UCP 14(h)."

OUTPUT
------
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<summary + per-clause line>","confidence":<0.0-1.0>}
