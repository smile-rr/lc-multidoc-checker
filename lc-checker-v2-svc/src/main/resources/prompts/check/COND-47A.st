Examine MT700 :47A: Additional Conditions for compliance against presented documents.

INPUT
  • LC :47A: text — the issuing bank's free-form additional conditions block.
  • All extracted document fields above.
  • UCP 600 / ISBP 821 reference text resolved inline (use as authoritative basis).

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
