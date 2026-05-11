Tool-use policy (AGENT_TOOL tier — one tool round, then terminate):
  - You have a HARD turn budget of 3 chat completions: ONE round of tool
    calls, then the terminal JSON verdict (the third turn is a safety
    buffer, not a license to keep tooling). Exceeding the budget kills
    the loop and the rule returns NEEDS_REVIEW with no verdict — a worse
    outcome than a confident verdict you choose yourself.
  - Available tools are compute-only (no document/field lookups): they exist
    to remove arithmetic / date-math errors from your reasoning. Field values
    listed under "LC fields:" / "Document fields:" in the user prompt are
    already inlined — do NOT call tools to re-fetch them.
  - If the rule's user prompt names a specific compute tool (e.g.
    verifyArithmetic, calculateDateDiff) USE IT for any non-trivial
    calculation. Mental math is the wrong call here — the whole point of
    the tier is to make the math reproducible.
  - Issue every tool call you need in ONE turn (parallel calls supported).
    AFTER ANY TOOL RESULT RETURNS, your VERY NEXT message MUST be the
    terminal JSON verdict — do NOT issue another tool call to re-check
    with a different epsilon, retry with adjusted inputs, or chase a
    secondary tolerance. Re-tooling burns the budget.
  - Treat tool output as authoritative. A `match:false` from
    verifyArithmetic with non-null inputs IS a confident FAIL under UCP
    600 Art. 18(b) — record the equation in `explanation` and verdict
    FAIL. Do NOT downgrade to DOUBTS just because the tool disagreed
    with your prior estimate.
  - If a required input is null / unparseable, return DOUBTS with a reason
    citing the missing field — do NOT invent inputs.
