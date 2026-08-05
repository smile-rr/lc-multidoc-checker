# Plan — evidence to the agents, fact fidelity, and the condition language

The ordered implementation of
[`docs/architecture/evidence-and-agents.md`](../architecture/evidence-and-agents.md).

Three stages, in dependency order. Every step compiles clean, passes `./gradlew test` (compile + the
ArchUnit boundary rules + `MigrationTest`) and `npm run smoke`, and leaves the system working.

**Start at Stage A.** It is the design document's own subject, it needs no migration and no new
language, and every step is independently revertable.

---

## Stage A — the evidence reaches the agents

No schema change. No new vocabulary. Touches `PromptContext`, `PlanStage`, `ExecuteStage`,
`CaseStore` (one read) and the plan prompts.

### A1 — a typed prefix boundary

`PromptContext` gains a third tier rendering **between** `stable` and `varying`, so the ordering
that §6 of the design depends on is a type rather than a convention. `ExecuteStage` moves
`THE PRESENTATION` onto it.

*Why:* the fact sheet is byte-identical across examiners and is what the first-group-alone warming
exists to cache. Today blocks 2–5 are all volatile and the boundary is positional — a future block
added in the obvious place silently destroys the warming, and the regression appears as a cost
number nobody can trace back to a block ordering.

- `tb-helix-ai-svc/src/main/java/com/tb/helix/harness/llm/text/PromptContext.java`
- `tb-helix-ai-svc/src/main/java/com/tb/helix/lccheck/stage/execute/ExecuteStage.java`

### A2 — fact availability to `requirements` and `govern`

A helper on `PlanStage` building the block from `cases.facts(caseId)` and
`cases.documents(caseId)`: per document, which field keys came back with something, which came back
empty, which documents were not presented. **Keys only, never values.** Added as the first volatile
block on both plan calls.

```
WHAT WAS ACTUALLY READ FROM THIS PRESENTATION
  LC   read:      credit_amount, currency, expiry_date, latest_shipment_date, …
  BOL  read:      on_board_date, port_of_loading, signed
  BOL  not read:  shipper_name, consignee
  INV  not presented

  These are field keys, not their values.
  Do not attempt to answer any requirement from this list — you are writing conditions,
  not settling them. Do not write a condition that reads a field listed as not read.
```

*Why keys only:* the planner writes conditions. Handed values it answers them instead, and the
answer is a model's opinion wearing an exact check's clothes. It also breaks the traceability rule —
a condition compiled from what a document says is a rule that passes by construction.

- `PlanStage.java`, `src/main/resources/prompts/plan-requirements.st`, `prompts/plan-govern.st`

**Note in the step's completion message** that `requirements` keys its derivation cache on the
volatile digest, so the plan step's cache hit rate will fall. That is correct — two presentations
with different extraction outcomes *should* get different plans — but it will read as a cost
regression otherwise.

### A3 — widen the credit given to `requirements`

The whole `parsedCredit` tag map, not just 46A and 47A, with those two still called out by name.

*Why:* 47A routinely references tags it does not restate — *"presentation within the validity of the
credit"*, *"shipment as per 44C"*. Today the planner cannot see 44C and must guess or give up. The
data is already loaded.

- `PlanStage.java`, `prompts/plan-requirements.st`

### A4 — quality signals in the examiner fact sheet

`factSheet()` renders an off-dictionary reading visibly (the `flag` is already stored), and carries a
credit term's `source` so an amended term is distinguishable from an original.

*Why:* today an invented field and a dictionary-bound one are typographically identical to the
judge, and so are an amended term and an original one. Both failures are silent, and both change the
answer.

- `ExecuteStage.factSheet()`

### A5 — remit-scoped layout markdown

A new `THE DOCUMENTS IN YOUR REMIT` block, **below** the A1 boundary, carrying
`lc_document.layout_md` for the documents this remit's checks name. Capped per document, with the
truncation **stated in the block**.

*Why:* the markdown is already paid for, page-ordered, and the only place a table survives intact. A
wording check needs the wording, and folding it into fields is exactly what destroyed it. The cap
exists because the reverse of a bill of lading is the largest markdown in a typical bundle and
answers nothing; the truncation is stated because silent truncation reads as *"you have been shown
the whole document"*.

- `ExecuteStage.java`, `CaseStore` (read `layout_md` by doc code), `application.yml`
  (`helix.check.execute.markdown`, `helix.check.execute.markdown-chars`), `prompts/examine-checks.st`

### Verifying Stage A

Run `test/cases/01-widgets-singapore/lc-amended.txt` through to `execute`; confirm from the run log
that the shared prefix is byte-identical across examiner groups and that the first group still runs
alone; and compare the plan's requirement cards before and after A2 for conditions naming fields
nothing extracted.

---

## Stage B — fact fidelity

Design §8. Prerequisite for trusting any exact check, whatever language it is written in.

| | change | note |
|---|---|---|
| **B1** | **Stop the false discrepancy.** `FactWriter` flags a value it had to serialise; `RuleEvaluator` returns **INCONCLUSIVE**, not FAIL, on a flagged operand, with the gap recorded. | no migration. **Do this first** — it converts a confident wrong answer into an honest one immediately |
| **B2** | **Represent repetition.** `repeatable` on a `FieldBinding`; the extraction prompt returns an array for those; `lc_fact` gains `ordinal`; the unique key becomes `(case_id, doc_code, label, ordinal)`. One migration. | the prompt shape changes first — no schema change alone reaches it |
| **B3** | **Set semantics** — `anyOf` / `allOf` / `noneOf`, so a multi-valued operand is comparable rather than string-matched. | lands with the condition language; both operands stay fields |
| **B4** | **Light the credit anchor** — pass `anchorId` through `IntakeStage.writeCreditFacts`'s `Rows.of(...)`. Lights `GateStage.creditAnchor()`, Review's credit highlight, and Interpret's clickable credit rows. | three lines, four screens to verify |
| **B5** | **Real confidence** — carry the vision consensus's per-field agreement into `lc_fact.confidence`. Lights the LOW chip and the low-confidence header. | the signal is computed and discarded today |

---

## Stage C — the condition language

Replacing the JSON condition tree with a SpEL expression check. Design decisions, settled:

- **SpEL parses and evaluates**, but never sees an absent value and never sees a raw fact string.
  Values are bound as types resolved from the dictionary's `valueType` (`LocalDate`, `BigDecimal`, a
  case-folding text wrapper), and string literals are wrapped too — so `==` folds case and
  whitespace instead of silently dropping it, and money arithmetic is exact. An unresolved operand
  is **never bound**: its leaf is marked unknown before evaluation, so a null can never reach a
  comparator that treats it as less-than-everything.
- **Leaf by leaf, skeleton in Java.** The whole expression is not handed to SpEL: the evidence table
  needs a row per comparison, and absence must not read as false. Leaves are sliced by AST position
  and evaluated individually; `and`/`or` compose in Java, run twice with unknowns forced each way —
  agreement means the answer is forced by what was read. Non-monotone constructs (`!`, boolean `!=`,
  ternary, elvis) are rejected at compile time, because with them the double run produces *false
  definites* rather than merely imprecise ones.
- **A whitelist over the AST is the security boundary.** An LLM writes these strings. Every node
  class must be on the allow list; `T()`, `@bean`, `new`, method invocation, property navigation,
  projection, selection, assignment and inline collections are rejected by name.
  `SimpleEvaluationContext` only, no root object, values as variables.
- **Graded clauses.** A check carries an ordered clause list, first not-definitely-false clause
  decides. *"Late shipment"* and *"possibly late shipment"* become two clauses of one check, and
  therefore **one** finding — no change to `lc_finding`, no migration.
- **The existing `Comparison` kind keeps running**; a config flag hides it from the *New check*
  menu, with a per-check author-initiated *Convert to expression*.
- **One condition language per run** for the planner, behind a flag.

Phases: refactors (`Values` extraction, strict-inequality operators, shared problem strings,
`ComparisonView` additions, editor split) → grammar (`ConditionExpr`, verbs, the parser package, the
AST whitelist, its focused test, a new ArchUnit containment rule) → evaluator and evidence →
persistence, views and the new check type → console → planner → the tree-to-expression printer and
the seed → documentation.

**Do not start Stage C before B1.** A new comparison language over a fact model that turns two
loading ports into a false discrepancy gets blamed for the fact model's defect.
