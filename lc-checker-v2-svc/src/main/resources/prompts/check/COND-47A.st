Examine MT700 :47A: Additional Conditions for compliance against presented documents.

INPUT
  • LC :47A: text — the issuing bank's free-form additional conditions block.
  • All extracted document fields above.
  • UCP 600 / ISBP 821 reference text resolved inline (use as authoritative basis).

EFFICIENCY (mandatory)
  • Call `getAllExtractedFields(sessionId)` ONCE at the start. It returns
    every LC field, every doc's typed fields, AND every doc's
    `off_schema` array (verbatim non-schema text — declarations, footers,
    stamped clauses, quoted statements). One bulk call is the entire
    data plane for this rule.
  • Do NOT loop per (field, doc). 6 LLM iterations max — reserve 1 for the
    bulk fetch, 1-2 for compute, the final for the terminal JSON.

EVIDENCE TO USE (in priority order)
  1. Typed schema fields (e.g. `lc_number`, `invoice_number`).
  2. **off_schema[] for every relevant doc** — this is where statements
     like "INVOICE NUMBER: INV-2024-0317", "LC NO. WIDG-2024-0317",
     "ISSUED IN ENGLISH", "CERTIFY THAT…" actually live. Search the
     rawQuote / value of every off_schema item for the LC condition
     keywords before you decide.
  3. Cross-doc consistency (e.g. invoice's lc_number == LC's lc_number).

DOUBTS vs FAIL — be strict, not lenient
  FAIL when:
    • LC condition stipulates a fact that documents must show, AND
      the documents (typed fields + off_schema) clearly do NOT show it
      (e.g. invoice missing LC number string anywhere, BC bears wrong
      LC number, document obviously not in the required language).
    • Numeric / id mismatch (LC number differs, contract number wrong).
  DOUBTS only when:
    • Genuinely ambiguous extraction (the off_schema captured a fragment
      that *might* contain the required text but is unreadable or
      truncated), OR
    • The condition requires semantic interpretation that needs a human
      (e.g. "of acceptable quality" — not decidable from text).
  Default to FAIL over DOUBTS when extraction is complete and the data
  simply isn't there. Missing required data IS a discrepancy under UCP
  14(a) "documents on their face".

TASK
This rule is a *single AGENTIC check whose verdict aggregates a per-condition
breakdown*. You MUST:
  1. Decompose :47A: into atomic conditions. One numbered/bulleted item per
     condition. Continuation lines (e.g. an address that overflows) belong to
     the same condition.
  2. For EACH condition, determine its compliance status against the presented
     documents and the LC's other fields. Cite UCP / ISBP whenever a clause is
     interpreted (e.g. UCP 14(d), ISBP A19, UCP 28).
  3. Aggregate to a top-level verdict:
        FAIL          — any sub-condition is FAIL with severity CRITICAL or MAJOR
        DOUBTS        — any sub-condition is DOUBTS, or mixed PASS/NOT_APPLICABLE only
        PASS          — all sub-conditions PASS or NOT_APPLICABLE
        NOT_APPLICABLE — every sub-condition is NOT_APPLICABLE / OUT_OF_SCOPE
  4. severity for the top verdict = the maximum severity of any FAIL sub-condition;
     MAJOR if no FAILs.

CONDITION CLASSIFICATION
For each condition, classify check_kind so downstream tooling can route it:
  PROG          — pure field equality / arithmetic, decidable from extracted fields
  AGENT         — semantic interpretation needed (e.g. "in English", "third-party
                  documents acceptable")
  OUT_OF_SCOPE  — instructions to the issuing bank or correspondent bank, not
                  examined by the presenting bank (e.g. "charges for our
                  account", "negotiate by airmail")

UCP/ISBP CITATION
When relevant, cite the article id (no excerpts — the UI resolves text).
Use [UCP-XX-y] or [ISBP-AXX] tokens inside `explanation`. Reference text was
already resolved into your prompt; do not re-emit it.

OUTPUT — single JSON object, no markdown fences

{
  "verdict": "PASS|FAIL|DOUBTS|NOT_APPLICABLE",
  "confidence": 0.0-1.0,
  "explanation": "<aggregated 1-2 sentence summary, e.g. '5 conditions; 3 PASS, 1 FAIL (insurance amount), 1 OUT_OF_SCOPE'>",
  "condition_results": [
    {
      "condition_id": "47a-1",
      "condition_text": "<verbatim source line(s) — exactly as printed in :47A:>",
      "applies_to_docs": ["INV","BOL", ...],
      "check_kind": "PROG|AGENT|OUT_OF_SCOPE",
      "severity": "CRITICAL|MAJOR|MINOR",
      "verdict": "PASS|FAIL|DOUBTS|NOT_APPLICABLE",
      "confidence": 0.0-1.0,
      "explanation": "<one-sentence finding citing UCP/ISBP if applicable>",
      "ucp_refs": ["UCP-28"],
      "isbp_refs": ["ISBP-K10"]
    },
    ...
  ]
}

CONSTRAINTS
  • Do NOT invent conditions absent from :47A:. The condition_text MUST appear
    verbatim in the source.
  • If :47A: is empty/null, return verdict NOT_APPLICABLE with empty
    condition_results.
  • Out-of-scope conditions still appear in condition_results with verdict
    NOT_APPLICABLE — they're part of the audit trail.
  • condition_id is human-readable (47a-1, 47a-2, …). Stable per run; reused
    for officer override targeting.
  • Output JSON only; no prose, no markdown fences.
