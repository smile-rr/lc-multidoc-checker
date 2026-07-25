# Helix AI — Component Architecture

Detail level. [`../README.md`](../README.md) has the shape and the argument; this has what is inside
each component, the contracts between them, and what a definition actually looks like.

Nothing here is built. Where an existing file is the nearest thing to a component, it is named — the
work is mostly separation, not invention.

**Contents** — [Shape](#the-shape) · [Core](#helix-ai-core) · [Orchestration](#the-orchestration-module) · [Services](#the-app-services) ·
[Definition format](#definition-format) · [Metrics, logs, eval](#metrics-logs-and-eval) · [Contracts](#contracts) ·
[Both apps end to end](#both-apps-end-to-end) · [Open questions](#open-questions) ·
[Research basis](#research-basis)

Diagrams: [`helix-ai-overview`](diagrams/helix-ai-overview.excalidraw) ·
[`helix-ai-core`](diagrams/helix-ai-core.excalidraw) ·
[`helix-ai-svc`](diagrams/helix-ai-svc.excalidraw)

`helix-ai-svc` covers all three services in one table: rows are the kinds of declaration a service
makes, columns are the services. Layers — UI, API, repository — are deliberately absent. They are the
same in every service and say nothing about what any of them does.

---

## The Shape

```
Consumers
    │  domain APIs — POST /sessions, POST /extract
    ▼
LC Check svc                          Vantage Extract svc
  app code + definitions/               app code + definitions/
  own domain data                       own domain data
    │                                     │
    ▼                                     │
   uses flow module                       does not — one agent, no steps
    │                                     │
    ▼                                     ▼
          helix-ai-core   —   one library, four modules
            Agent Harness   agent loop · context · models · tools · evidence
            Orchestration   step runner · gates · fan-out · resume
            Evaluation      goldens · scorers · regression gate
            Observability   metrics · trajectory · cost roll-up

  LC Governance svc publishes the rule catalogue, agent definitions and references
  to LC Check svc. Those are LC domain content, not part of the library.
```

**Why the flow runner is not in the harness.** A harness is agent-scoped — one execution, seconds
long, stateless. A flow runner is case-scoped — ordered steps, gates, resume, hours long, durable,
needs a schema. That is a workflow engine, and putting it in the harness would make the stateless
thing inherit the stateful thing's requirements. Vantage Extract proves the split: one agent, no
steps, so it takes `core` and nothing else.

Three properties fall out of this and are worth stating because they are what the design buys:

**The Core never holds product data.** It is handed a definition and an input and returns a result.
A case, a finding and an officer's decision belong to LC Check svc; a request and an extraction
belong to Vantage Extract svc.

**The Core never talks to a consumer.** Each service presents the domain API its callers deserve.
A tier is a method the service chooses, not a route a caller picks.

**The Core emits; it does not collect, store or score.** Metrics leave through a Micrometer
`MeterRegistry`, logs through SLF4J, trajectories and evidence through the `RunListener` the caller
supplies. All three are facades. The enforceable form of this rule: **`helix-ai-core`'s dependency
list contains no backend** — no JDBC, no OTLP exporter, no logging implementation. Put it in the
build as a banned-dependency check; a boundary defended in code review erodes.

**Definitions ship with the service that owns them.** Versioned in its repo, reviewed in its pull
requests, deployed in its jar. There is no definition service to be down.

---

## helix-ai-core

A Gradle module publishing one artifact. Depends on Spring AI for text inference and plain
`RestClient` for vision — the split that already exists in `lc-checker-v2-svc` and should survive.

### Execution kernel

Generic. Nothing here has product vocabulary. This is the loop, harness and context engineering
layer, and it is the part that is worth getting right once.

#### Execution Loop

The observe → think → act cycle, with termination and error recovery. One loop serves all four rule
tiers in [`../LC-Check.md`](../LC-Check.md); they differ only in declared caps and grants:

| Declared | Behaviour |
|---|---|
| no tools, `max_iterations: 0` | one completion (PROGRAMMATIC / AGENT) |
| tools, `max_iterations: 1` | one round of tool calls (AGENT_TOOL) |
| tools, `max_iterations: 3` | full ReAct, capped (AGENTIC) |

Also owns **structured-output repair**: when a response fails its declared schema, re-prompt with
the validation error, bounded. Schema adherence varies enough between models
([PromptPort][promptport]) that this belongs in the library rather than in every app.

And **sub-agent spawn**: a fanned-out step gets a clean context window and returns a condensed
result, rather than every check sharing one polluted window.

*Nearest today:* `stage/compliance/AgentRuleExecutor.java`.

#### Context Manager

Decides what enters the window. Per [Anthropic's context engineering][ctx], the target is the
smallest set of high-signal tokens, not the largest available set.

- **Assembly** — system prompt, granted tool schemas, the step's declared context refs, prior step
  outputs
- **Progressive disclosure** — reference *ids* in context; text fetched only when a step reaches for
  it. This is what makes 19 rules plus six documents fit
- **Compaction** — completed steps summarise to their conclusions. LC Check compacts well because a
  finished review area is a paragraph, not a transcript
- **Just-in-time retrieval** — lightweight identifiers, loaded on demand, rather than pre-loading
- **Extract cache** — keyed on content hash + prompt hash + model + render params; a hit skips
  render and inference entirely

*Nearest today:* `infra/cache` (`CacheKey`, `VisionCacheIdentity`) — a working cache with the right
key shape. The rest is implicit in prompt templates.

#### Inference

Maps a declared tier to a concrete model, prices it, and falls back.

```yaml
tiers:
  vision-tier:    { primary: qwen3-vl-4b,     fallback: gpt-4o }
  cheap-tier:     { primary: qwen3-32b,       fallback: qwen3-14b }
  reasoning-tier: { primary: claude-sonnet-4-6 }
```

Apps name tiers, never models, so swapping a provider is a Core config change and the cost reporting
stays correct because pricing lives with routing.

**Consensus voting is a first-class mode, not a config detail.** Today's parallel vision slots run
the same page through several models and vote, slot-1 winning ties. That is a real quality mechanism
and it must survive the move into the library.

`enable_thinking: false` at request top level for Qwen3-family models belongs here too — a
provider quirk the apps should never have to know.

*Nearest today:* `vision-llm.slot-1..4` in `application.yml`, `stage/parse/VisionExtractService.java`.

#### Tool Registry

Typed catalogue. Every tool declares a JSON schema for input and output; the registry validates both
directions, so a malformed call is caught before it reaches app logic.

| Family | Tools |
|---|---|
| Document | `pdf.render`, `pdf.segment`, `vision.extract`, `ocr.text` |
| Compute | `date.diff`, `date.banking_days`, `money.tolerance`, `math.eval` |
| Retrieval | `ref.lookup`, `catalog.lookup`, `case.similar` |
| Message | `swift.parse`, `swift.tags` |

Two rules from [Anthropic's tool-design guidance][tools]: minimal functional overlap, so the model
never faces an ambiguous choice; and token-efficient returns, because a chatty tool poisons every
step that calls it.

**Grants are enforced at dispatch, not requested in a prompt.** An agent never granted
`vision.extract` cannot call it. That is a permission model; a prompt instruction is not.

*Nearest today:* `stage/compliance/tools/`.

#### Execution Sandbox

The component this design was missing until it was pointed out.

Any tool that evaluates an expression is running code. `math.eval` is code execution; so is the SpEL
evaluator that runs today's PROGRAMMATIC rules; so is anything an agent writes tomorrow. Each needs
a budget it cannot exceed:

| Bound | Why |
|---|---|
| wall-clock | a rule that never returns must not hold a case open |
| memory | an expression must not be able to exhaust the service |
| network | a compute tool has no business reaching the internet |
| filesystem | no reads outside what was handed in |

Running this in-process inside a bank's service is precisely why it needs to be explicit. The
alternative — trusting a declared expression because a reviewer approved it — is how a governance
console becomes a remote-code-execution surface.

*Nearest today:* `SpelEvaluator`, unbounded.

---

## The Orchestration module

Orchestration, in its own module because it is case-scoped and durable where the harness is
agent-scoped and not. Depends on `harness`; LC Check svc uses it, Vantage Extract svc does not.

#### Flow Runner

Executes the app's declared flow. Knows four things and no more: run a step, wait on a gate, fan
out, carry results forward.

- **Steps** — ordered, each resolved to an agent or a fan-out
- **Gates** — a step marked `gate:` stops and waits to be released. **The Core does not know or care
  who releases it.** That the releaser is a trade-finance officer is LC Check's business
- **Fan-out** — `over: checks, max_parallel: 6`, merged by a declared step
- **Resume** — from the last completed step; a crash mid-execute must not re-read six PDFs
- **Failure** — a failed step fails its branch, not the run; the trajectory records which

*Nearest today:* `pipeline/PipelineService.java`, `LcV2Pipeline.java` — right behaviour, LC flow
hardcoded into it. The single highest-value extraction.

#### State Store

Run state, resumable. Distinct from an app's domain data: the Core records *how a run went*, the app
records *what it means*.

| Core owns | App owns |
|---|---|
| run, step status, gates, retries, trajectory | cases, documents, findings, officer decisions |

Because the Core is a library, it writes through an interface the app supplies — the app chooses the
schema and the datasource. Nothing forces two services to share a database.

*Nearest today:* `pipeline_steps`, `pipeline_events` — Core-shaped tables sitting in an app schema.

### Evidence — emitted by the Core, kept by the service

Every finding and every field carries where it came from and how sure the system is. The Core
*produces* this and hands it to the `RunListener`; persisting it is the service's decision.

```json
{
  "field": "latest_shipment_date",
  "value": "2025-02-14",
  "confidence": 0.93,
  "provenance": { "source": "mt700", "tag": ":44C:", "line": 42 },
  "trajectory": "run_8821/step_extract/agent_extractor"
}
```

Provenance is not decoration — extraction without links to textual origin is
[unverifiable by construction][prov]. Per-field confidence allows *field-level* review instead of
rejecting a whole document ([multi-signal confidence][conf]), and
`policy.human_review_below_confidence` turns that into routing.

Confidence must be **calibrated**, not raw logprobs. A number that does not mean what it says is
worse than no number, because people act on it.

*Nearest today:* findings carry quoted evidence and a citation. Confidence is not modelled at all.

### Programmatic surface

```java
CompletionResult complete(String prompt, TierRef tier);
AgentResult      runAgent(AgentDef agent, Object input);
FlowResult       runFlow(FlowDef flow, Object input, RunListener listener);
```

`RunListener` is how progress leaves the library — the app translates those callbacks into whatever
its consumers speak. LC Check svc turns them into SSE for the workbench; Vantage Extract svc mostly
ignores them and returns a value.

---

## The App Services

### LC Check svc

Today's `lc-checker-v2-svc`, minus the machinery that moves into the Core. What remains is the part
that is genuinely about credits:

- the domain API (`/sessions`, `/stages/{stage}/run`, `/findings/{id}/decision`, `/signoff`)
- case, document, finding and officer-decision persistence
- MT700 parsing, doc-type classification, the reconcile matrix
- `definitions/` — flow, agents, rules, context
- SSE translation for the workbench

The officer-pacing behaviour built into the workbench — Auto and Step, five stages, gates — is
`flow.yaml` plus a release endpoint. Nothing about it needs to be in the Core.

### Vantage Extract svc

New, and small on purpose.

```
POST /v1/extract
{ "message": "...MT701 text...", "profile": "mt7xx-core-fields" }

200
{ "fields": [ { "name": "...", "value": "...", "confidence": 0.93, "provenance": {...} } ],
  "review_required": ["goods_description"] }
```

One agent, one schema, no gates. Its hard part is not orchestration but the fields that are prose
rather than values — `:45A:` goods, `:47A:` conditions, party names inside address blocks. Those are
marked `reasoning: true` in the schema, which tells the Core to send surrounding context and tells
the confidence layer to expect a wider distribution.

It is also the service that will be called in bulk, so quota and per-consumer isolation land here
first.

---

## Definition Format

Shared by both services, and shipped inside whichever service owns it.

**`flow.yaml`** — the file that makes a service an app.

```yaml
flow:
  - id: interpret
    agent: doc-reader
    tools: [pdf.render, vision.extract]
    model: vision-tier
    gate: true            # ← LC Check pauses here; Vantage Extract omits it entirely
  - id: plan
    agent: planner
    tools: [catalog.lookup]
    model: cheap-tier
    gate: true
  - id: execute
    fan_out: { over: checks, max_parallel: 6 }
    model: reasoning-tier
    gate: true
  - id: reconcile
    agent: merger
  - id: report
    agent: memo-writer
```

**`agents/dates-checker.yaml`**

```yaml
id: dates-checker
model: reasoning-tier
max_iterations: 3
tools: [date.diff, date.banking_days, ref.lookup]
context:
  - ref: ucp600#14b
  - ref: isbp821#A19
prompt: prompts/dates.md
output: schema/finding.yaml
```

**`schema/mt7xx-core-fields.yaml`** — the output contract; for Vantage Extract this *is* the product.

```yaml
fields:
  - name: beneficiary_name
    type: string
    required: true
    source_hint: ":59:"
    description: >
      Legal name only. Strip address lines. Join a name that runs across lines.
      Do not infer from the applicant.
  - name: goods_description
    type: text
    source_hint: ":45A:"
    reasoning: true
  - name: latest_shipment_date
    type: date
    format: iso8601
    source_hint: ":44C:"
```

**Citations are by id, resolved at execution** — `{{ref.ucp600#14b.text}}` — so rule text lives in
one place and a definition cannot drift from the corpus it cites. The corpora themselves
(`ucp600.yaml`, `isbp821.yaml`, field pools) are owned and published by **LC Governance svc** — they
are LC domain content, not a Helix library, and a library that shipped a legal corpus would stop
being reusable outside trade finance. Vantage Extract keeps its own SWIFT tag briefing in its
definitions rather than depending on Governance.

**`evals/`** — golden cases with thresholds. A version that regresses its own goldens does not
ship. For LC Check the goldens are decided presentations; for Vantage Extract they are messages with
hand-checked field values. This is the [survey's evaluation interface][survey] moved to design time,
which is where it belongs: a runtime that emits trajectories is useless without a set to score them
against.

---

## Metrics, Logs and Eval

The Core emits, each service adds its domain signal, and eval closes the loop. All three are
cross-cutting, and all three are cheaper to design now than to retrofit onto a running system.

### Metrics

**From the Core**, per run and per step, with fixed names so a dashboard can span both services:

| Metric | Why it earns its place |
|---|---|
| `tokens_in` / `tokens_out` by model | the input to cost, and the thing that moves when a prompt changes |
| `cost` by model, step, run | what the workbench's cost drawer already shows |
| `latency` per step, and per tool call | separates model time from PDF-render time |
| `cache_hit_ratio` | the extract cache is the largest single cost lever; unmeasured, it silently degrades |
| `retries`, `repairs` | a rising repair rate is a model or schema regression before it is a cost one |
| `fallbacks` | a primary model failing over is invisible in cost but visible here |
| `iterations` per agentic step | tells you whether a cap is binding, i.e. whether answers are being truncated |
| `consensus_disagreement` | **the quality signal nothing else gives us** — when parallel vision slots disagree on a page, that page is hard, and the rate over time tracks extraction quality without any labels at all |

**From each service**, its own — and these are the ones a business audience reads:

| LC Check svc | Vantage Extract svc |
|---|---|
| cases per day, by status | requests, fields extracted |
| discrepancies raised, by severity | share below the confidence threshold |
| dispositions: agreed / parked / set aside | review rate, and review outcome |
| **gate wait** — how long a run sat waiting for a person | p95 end-to-end, against the SLA |
| presentation-to-decision, against UCP 600 art. 14(b) | |

Gate wait is worth calling out: in an officer-paced pipeline most elapsed time is *not* machine time,
and a system that reports only machine time will look fast while cases age toward the art. 14(b)
deadline.

### Logs

Structured, correlated by `runId · stepId · agentId`. At agent level **the trajectory is the log** —
there is no separate "what the agent did" record to keep in step.

Three rules, all easier to adopt now than to retrofit:

- **Prompt hashes, not prompts.** A prompt carries the document; the document carries the parties,
  the amounts and the goods. Log the hash and the template id; keep the prompt only where policy
  says it may live.
- **Redaction before write, not after.** A redaction step that runs on read is a redaction step that
  can be forgotten.
- **Retention declared per service.** An examination audit horizon and a 30-day extraction log are
  different obligations and should not share a default.

### Eval

**Offline.** Goldens live in each service's `definitions/evals/` and run in CI as a regression gate:
a version that regresses its own goldens does not ship. LC Check's goldens are decided
presentations; Vantage Extract's are messages with hand-checked field values.

**Online.** Sample production runs and score them. Here the two services are not alike, and planning
as though they were is the mistake to avoid:

> **LC Check labels itself.** Every finding gets an officer disposition — agree, park, set aside —
> and that is ground truth produced by the workflow at no extra cost. True positives, false
> positives and false negatives fall straight out of it, which is where the AI Performance panel's
> precision and recall come from.
>
> **Vantage Extract has no such source.** Nobody downstream reports that a field was wrong; a bad
> value simply flows on. Its labels must be manufactured — from fields flagged below the confidence
> threshold and returned by a reviewer, plus periodic hand-checking of a random sample. That sample
> is a running cost, and if it is not budgeted the service will have no idea whether it is
> improving.

**Calibration.** Confidence must be calibrated against the eval sets, not taken as raw logprobs, and
recalibrated whenever a model inside a tier changes. A confidence number that does not mean what it
says is worse than none, because `human_review_below_confidence` routes on it.

---

## Contracts

Three interfaces. If they hold, the pieces can be built and replaced independently.

**Consumer → App.** The app's own domain API. No Helix vocabulary crosses this line — no tiers, no
flows, no agents.

**App → Core.** The three method calls above, plus a `RunListener` and a `StateStore` the app
implements. The Core asks the app for persistence rather than owning a datasource.

**Core → App (progress).** Uniform callbacks across apps:

```
runStarted · stepStarted · stepProgress · stepGated · stepDone
toolCalled · valueProduced · runDone · runFailed
```

The workbench's SSE handling already has this shape — it consumes `segment`, `area_started`,
`area_done`, `step_done` today.

---

## Both Apps End To End

**Vantage Extract** — Tier 1, headless, seconds.

```
consumer → POST /v1/extract
  svc  loads definitions/agents/extractor.yaml + schema/mt7xx-core-fields.yaml
  svc  core.runAgent(extractor, message)
       kernel  assemble context (tag briefing + schema + message)
       kernel  inference @ cheap-tier → JSON
       kernel  validate against schema → repair once if it fails
       kernel  attach provenance + per-field confidence
  svc  flag fields below policy threshold
     → 200 { fields[], review_required[] }
```

**LC Check** — Tier 2, interactive, hours.

```
officer → POST /sessions                     (case created; nothing read, nothing spent)
officer → POST /sessions/{id}/stages/interpret/run
  svc  core.runFlow(flow, case, listener)
       runner  step interpret → agent doc-reader → fan of vision extracts → gate
  svc  ← stepGated                            (workbench shows "Plan the checks")
officer → POST /sessions/{id}/stages/plan/run
       runner  step plan → planner → gate
officer → …execute → reconcile → report
  svc  persists findings with evidence + UCP citation
officer → agree / park / set aside, per finding, then sign off
```

The instructive part is what the Core does *not* do differently between them. It resolves a
definition, runs declared steps, honours declared gates, and emits the same callbacks. Every
difference above was declared.

---

## Open Questions

Worth settling before code.

1. **Does `helix-ai-core` live in this repo or its own?** Own repo gives a real version boundary and
   forces the API to be designed; same repo is faster and keeps the first migration honest. A
   Gradle module here, published to a local repo, is the cheap middle.
2. **Where is flow validity checked?** A flow referencing an agent that grants a tool that does not
   exist should fail at build, not at run. That argues for a Gradle plugin over a runtime check.
3. **Do gates belong in `flow.yaml` or in the app's controller?** Declared in the flow here. The
   alternative — the app simply not calling the next step — is simpler but loses the audit property
   that the *definition* required a human.
4. **How is confidence calibrated?** Per app, per field type, against the eval sets — and it needs a
   recalibration story every time a model in a tier changes.
5. **What triggers putting the Core behind HTTP?** Proposed answer: the first non-JVM consumer, and
   nothing else. Not "when we have time" — an HTTP surface built speculatively gets built against
   one caller's imagination.
6. **Who owns the metric contract?** If each service names its own metrics, no dashboard spans both.
   The Core's metrics should be fixed names; a service's own are its business.

---

## Research Basis

- [Agent Harness Survey — 110+ papers, 23 systems][survey] — the `H = (E, T, C, S, L, V)` taxonomy
  the kernel follows, and the finding that production reliability requires all six
- [Effective context engineering for AI agents][ctx] — smallest high-signal token set, compaction,
  sub-agent isolation, just-in-time retrieval
- [Equipping agents for the real world with Agent Skills][skills] — progressive disclosure;
  separating "when to trigger" from "how to execute"
- [Writing effective tools for AI agents][tools] — minimal overlap, token-efficient returns
- [Beyond Logprobs: multi-signal confidence for document field extraction][conf] — per-field
  confidence enabling field-level review
- [Grounded extraction with provenance tracking][prov] — extraction without textual origin is
  unverifiable
- [PromptPort: a reliability layer for cross-model structured extraction][promptport] — schema
  adherence varies by model; repair belongs in the runtime

[survey]: https://github.com/Gloriaameng/Awesome-Agent-Harness
[ctx]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[skills]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
[tools]: https://www.anthropic.com/engineering/writing-tools-for-agents
[conf]: https://arxiv.org/pdf/2606.24420
[prov]: https://www.mdpi.com/2073-431X/15/3/178
[promptport]: https://arxiv.org/pdf/2601.06151
