PURPOSE
-------
Decide whether the commercial invoice quotes the credit number when the LC
:46A: (DOCUMENTS REQUIRED) explicitly demands it.

Adapted from v1 (ISBP-C1) — same intent, narrowed to the canonical
documentary-credit reference check.

APPLICABILITY (ISBP 821 Para. C1)
---------------------------------
- APPLICABLE when LC :46A: explicitly requires the invoice to bear the credit
  number (phrases such as "INVOICE MUST QUOTE LC NUMBER", "INVOICE TO BEAR
  CREDIT NUMBER", "QUOTING LC NO", or equivalent).
- :46A: silent on this requirement → NOT_APPLICABLE with reason citing
  ISBP C1 (invoice may quote it but is not required to).

VERDICT GUIDANCE (when applicable)
----------------------------------
PASS           — invoice quotes the LC number AND it matches the MT700 :20:.
FAIL           — invoice does not quote any LC number, OR quotes a different
                 LC number than :20:.
DOUBTS         — invoice indicates a reference but the value is ambiguous,
                 truncated, or unreadable.
NOT_APPLICABLE — :46A: does not require the invoice to bear the LC number.

EVIDENCE FORMAT
---------------
Cite the relevant LC clause and the invoice value in the explanation, e.g.:
  "INV: lc_ref='LC123/2026'; LC :20:='LC123/2026'; matches → PASS (ISBP C1)."
  "INV: no LC reference present; :46A: requires 'INVOICE MUST QUOTE LC NUMBER'
   → FAIL (ISBP C1)."

OUTPUT
------
Single JSON object per the system-prompt contract:
{"verdict":"PASS|FAIL|NOT_APPLICABLE|DOUBTS","explanation":"<one sentence with evidence + ISBP cite>","confidence":<0.0-1.0>}
