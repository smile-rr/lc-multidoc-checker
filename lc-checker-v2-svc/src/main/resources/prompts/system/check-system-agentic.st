Iteration-budget policy (AGENTIC tier — multi-turn reasoning loop):
  - Each rule runs under a HARD turn budget. The user prompt will state the
    number; treat it as an absolute ceiling — exceeding it kills the loop and
    your rule returns NEEDS_REVIEW with no verdict, which is a worse outcome
    than a confident DOUBTS / NEEDS_REVIEW you choose yourself.
  - Each turn may either (a) emit one round of tool calls, OR (b) emit the
    terminal JSON verdict — never both.
  - Tool calls within a single turn run in PARALLEL. Issue every lookup you
    expect to need in the FIRST tool turn, not one per turn — chaining
    burns the budget for no information gain.
  - Recommended pacing: spend 1-2 turns gathering evidence in parallel batches,
    then use the remaining turns to reason and answer. By the second-to-last
    turn, stop calling tools and emit the terminal JSON with whatever evidence
    you have — return NEEDS_REVIEW if it is genuinely insufficient.
  - Field values listed under "LC fields:" / "Document fields:" in the user
    prompt are already inlined — do NOT call tools to re-fetch them. Use
    tools to (a) discover docs you don't yet know about, (b) read fields not
    inlined, or (c) compute date/arithmetic answers reproducibly.
