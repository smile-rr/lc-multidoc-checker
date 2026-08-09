# Agent rules — one table, some of it answered by a person-shaped reader

## What this is

An agent check becomes the **same WHEN/THEN/ELSE table** an expression check already is. The
only difference is that a condition may be written in **natural language** where no comparison
can settle it, and those conditions are answered by an examiner instead of by the engine.

One authoring model, one walk, one set of three answers.

**Every check answers the same three words** — `clean`, `doubt`, `discrepancy` — whichever kind
it is. What differs between an expression check and an agent check is not the output and not
the shape: it is only **how a condition gets settled**, by comparison or by reading. That is
the whole of the distinction, and it is why they are the same card.

The Comparison card retires. Agent *governance* — the `helix_gov` examiners, their domains,
behaviour and articles — is untouched by this.

```
WHEN #same({INV.currency}, {LC.currency})
     and {INV.invoice_value} <= {LC.credit_amount}                    THEN "clean"
WHEN "the goods description on the invoice states a different product
      from the credit, beyond the generality art. 14(d) permits"      THEN "discrepancy"
ELSE "doubt"
```

A condition in **double quotes is a question for the examiner**. Everything else is SpEL, as
now. No fourth keyword: the position already says which is which — between `WHEN` and `THEN`
is the condition, after `THEN` is the answer.

---

## 1. The property everything else hangs off

**The model never chooses the outcome. It answers one question, true or false or "cannot
say", and the table decides.**

That is the whole design. It follows that:

- the walk is `ExpressionRule.decide` — the same code, for both kinds of card, so an agent
  check and an expression check cannot come to mean different things;
- every natural condition has its own recorded answer, so a finding says *which* question the
  examiner answered and how, not merely that a model concluded something;
- a model that returns nonsense for one condition degrades to UNKNOWN, and an unanswerable
  condition already **stops the table at doubt**. A garbled response cannot produce a
  discrepancy;
- `THEN "clean"` is not the model's to give. It is what the table says when the conditions
  above it did not match.

Today an agent check hands prose to a model and takes back whatever it says. The difference
is the difference between evidence and an opinion.

---

## 1a. One system prompt, and it is used in both places

The contract in §1 has to be stated to the examiner, and stated **once**:

> You are answering conditions, not deciding outcomes. For each condition you are given,
> answer `true`, `false`, or `unknown` where the documents do not let you say. What the check
> reports is decided from your answers by the rulebook, not by you. Never name an outcome.

`resources/prompts/agent-conditions.st`, re-read on every `get()` so it is hashed into the
derivation cache key like every other prompt — edit it and the cached answers invalidate
themselves.

**The same string is used by `agent:try` and by the examination.** This is the rule the
expression card already follows for `grammar()`: an author, the console's help, and the model
all read one text. A try panel running against a different prompt from the run is a try panel
that lies, and it lies in the direction of "it worked when I tested it".

It is a *resource*, not a governance document. An examiner's remit — domains, how to read,
which articles — stays authored in `helix_gov` and is layered underneath this; the contract
above is the harness's and is not an author's to vary.

---

## 2. Pre-walk: most agent checks should cost nothing most of the time

The table is walked **before** any model call, with natural conditions treated as "not yet
asked":

1. Walk the branches in order, settling every SpEL condition with the engine.
2. If an exact branch matches first — **no model call at all.** The check is settled.
3. Otherwise collect the natural conditions actually *reached*, and ask about those only.
4. Walk again with the answers in hand.

Two consequences worth designing for rather than discovering:

- An author can put the cheap deterministic case first and the reading second, and be paid for
  it. The example at the top costs nothing on a presentation whose currency and amount already
  agree.
- Conditions below a match are never asked, so a table is never billed for a question the
  examination did not reach.

---

## 3. The tool: the examiner can call the engine back

The examiner gets **one tool**, and it is the expression engine:

```
settle(expression)  →  "true" | "false" | "cannot be settled: {BOL.on_board_date} was not read"
```

It compiles the expression against the dictionary, evaluates it over *this case's* facts, and
answers. Refused exactly as authoring is refused — unknown field, unsafe construct, wrong
types — with the same sentences.

**Why this and not more tools.** A model asked "were the documents presented within 21 days of
shipment" will do date arithmetic in its head and be confidently wrong often enough to matter.
Handing it the engine moves the arithmetic to the thing that is exact and leaves the model the
part it is good at — reading a goods description and deciding whether two ways of writing it
are the same product.

It also means an examiner can *check its own reasoning* before answering: the tool call and its
result are recorded in `ToolSpec.Call`, so the audit trail shows the comparison the examiner
relied on.

> **The planner already has this**, as `check_condition` — it validates a condition it drafted.
> This is the same idea one stage later: `settle` also *runs* it. Whether they are one tool
> with two modes or two tools is §9.

---

## 4. Rounds — already built, nothing to do

The user's shape — *one call returns a list of tool calls with their inputs; we run them all
and return every result in one reply; the second call gives the judgement* — is exactly what
`StandardLlmGateway.loop` already does:

- every tool the model asked for **in one turn is run at once** (`FanOut`, order preserved,
  matched back by call id);
- all results are handed back in the **next single completion**;
- `maxIterations` counts completions, not tool calls, and is enforced in one place;
- `helix.check.agent.max-iterations: 3` is already the configured ceiling.

So the normal path is 2 completions and the cap is 3, today, with no harness change.

**A spent budget is not a conclusion.** `loop` returns `exhausted` with the calls made and no
text; the check must read that as *no answer* — every reached natural condition is UNKNOWN and
the table stops at doubt. Reading a partial conversation as a verdict is how an unfinished
check comes to look like a pass.

---

## 5. What the examiner is given

Unchanged from [`evidence-and-agents.md`](../architecture/evidence-and-agents.md) §5.4, and it
already answers this: the shared fact sheet, the remit (agent behaviour + article text), and
the layout markdown of the documents this remit's checks name. What changes is the **question**
— no longer "examine these checks and report findings", but "answer these conditions".

The four-layer prompt ordering stands, and the natural conditions are the volatile layer:

```
1  HOW TO ANSWER           stable    ── prefix the first group warms
2  THE PRESENTATION        shared
3  THE DOCUMENTS IN REMIT  per-remit
4  YOUR REMIT              per-remit
5  THE CONDITIONS          per-remit ← now a list of questions, not a list of checks
```

Grouping stays as it is: by examiner, `group-size` conditions per call, first group alone so
the rest ride its prefix.

---

## 6. Try it — same panel, real money

`POST /checks/agent:try` mirrors `expression:try`:

| | expression:try | agent:try |
|---|---|---|
| input | source + typed values | source + typed values + a document extract |
| cost | none | **a model call** |
| output | outcome, decided-at, reading | outcome, decided-at, per-condition answers, tool calls made |

Two things the expression panel does not need and this one does:

- **The Run button must say it spends money**, and the panel must show what it spent. An
  authoring aid that quietly bills is one nobody trusts twice.
- **The tool calls are the interesting output.** Seeing that the examiner called
  `settle({INV.invoice_value} <= {LC.credit_amount})` and got `true` is how an author learns
  whether their natural condition is doing work or duplicating a comparison they could have
  written exactly.

---

## 7. The card

Identical to the expression card: one `RuleEditor`, one Try panel, the same `Outcome` badge
and the same three words. The editor gains one thing — a double-quoted condition renders as
prose rather than as code, so the eye can see which lines cost money.

No per-condition widgets, no prose box, no separate agent editor. `JudgedBody.jsx` goes.

---

## 8. Retiring Comparison

Ordered, because the middle step is the one with a dependency nobody expects.

| | | |
|---|---|---|
| C-1 | Migrate `C0001`–`C0005` to expression tables | mechanical; each is rows of operands with one operator |
| C-2 | **Teach the planner to compile into a table** | `PlanStage.requirements` compiles `:46A:`/`:47A:` into `ConditionTree` today. Trees cannot be removed while the planner mints them |
| C-3 | Delete the tree authoring UI | `ExactBody.jsx`, operand pickers, `Operator`/`ConditionFn` served vocabulary, `shared/lib/operators.js` |
| C-4 | Delete the tree engine | `ConditionTree`, `RuleCompiler`, the tree half of `RuleEvaluator`, `v_check_list`'s operand SQL |

**C-2 is the real work and it is worth doing for its own sake** — a planner writing tables gets
`THEN "doubt"`, which it cannot express today, so a requirement it is unsure of currently has
to become a judged card or a false certainty.

`ConditionTree` is also what `v_dangling_reference` reads for tree checks; expression checks
already report through `check_facet`, so C-4 simplifies that view rather than complicating it.

---

## 9. Open decisions

| | question | leaning |
|---|---|---|
| 1 | One tool with a validate/run mode, or `check_condition` and `settle` separately? | one tool. The planner's "would this compile" is `settle` with no facts, and two names for one thing is how they drift |
| 2 | May a natural condition read `{DOC.field}` inside its prose, substituted before the ask? | yes — "the goods description `{INV.goods_description}` states a different product" saves the examiner a lookup and pins the question to what we actually read |
| 3 | Does `agent:try` run against a real case's facts, or only typed values? | typed values first. A case picker is a second feature and the panel is meant to be simple |
| 4 | Is a table with **no** natural condition still an agent check? | no — derive it. A table whose conditions all compile is EXACT and costs nothing, whatever the author typed. Same narrowing `tier` already applies |
| 5 | Where does the natural condition's answer live for audit? | `lc_finding.comparison`, as a row with the question as its label and the examiner's answer as its outcome — so one evidence view serves both kinds |
| 6 | What does the examiner return per condition? | `{id, answer, because}` — the answer settles the walk, `because` is one sentence and becomes the row's `why`. Nothing else: a model asked for more writes an outcome into it |
| 7 | Can a standing agent check ask an open-ended question at all? | see below — this is the one that changes what the seed holds |

---

## 10. The check that may not survive as a standing table

`A0001` (additional conditions, `:47A:`) is today: *"read {Additional conditions} one condition
at a time and decide what, if anything, evidences each."* Its conditions are **not fixed** —
they are whatever this credit happens to impose, and a standing table cannot enumerate them.

Two ways out, and they are genuinely different products:

- **It is the planner's, not the catalogue's.** `:47A:` is already read into requirement cards
  by `PlanStage.requirements`; each card becomes its own one-condition table, exact where the
  planner could compile it and natural where it could not. `A0001` then disappears from the
  seed. This is the cleaner story and it is why §8 C-2 matters.
- **It stays, as one broad question.** `WHEN "every condition in :47A: is evidenced by a
  document in this presentation" THEN "clean" ELSE "doubt"` — honest, but it collapses N
  conditions into one answer, so an officer is told "something in 47A is not evidenced"
  without being told which.

The first is right. It is recorded here because it means the seed loses a check rather than
gaining one, which is not what "implement agent rules" sounds like it should do.

---

## Order of work

1. **§2 pre-walk + §1 the model answers conditions** — backend only, no UI. This is where the
   correctness lives.
2. **§3 the `settle` tool.**
3. **§6 `agent:try`** and **§7 the card** together — the card is unusable without the endpoint.
4. **§8 C-1 and C-2**, then C-3/C-4 as a separate change.
