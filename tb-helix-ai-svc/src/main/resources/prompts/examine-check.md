Check {id} — {name}

Why it is in the plan: {because}
Authority: {authority}

{facts}

Decide whether the presentation satisfies this check, and answer:

{
  "verdict":    "pass" | "discrepancy" | "possible" | "inconclusive",
  "title":      short headline an officer would scan,
  "statement":  the formal one-line wording for a refusal advice, UPPERCASE,
                or null when the verdict is pass,
  "expected":   what the credit or the rules require,
  "presented":  what the documents actually say,
  "why":        why the difference matters, or why it does not,
  "document":   the document code the evidence sits on,
  "options":    ["what the officer could do"],
  "confidence": "HIGH" | "MED" | "LOW"
}
