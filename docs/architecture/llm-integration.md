# Integrating a model through a library, an SDK or a gateway

> **Question this answers.** *"We are not allowed to call `/chat/completions` over HTTP
> ourselves. We must go through an abstraction library / a corporate AI SDK / a managed
> gateway. How much of this service changes?"*
>
> **Answer.** One new class implementing two methods, and one line of YAML. Nothing in
> `lccheck`, `governance`, `infra` or the UI changes, and no prompt changes.

---

## 1. Where the seam is

```
        lccheck / governance          asks for a ROLE — never a model, never a provider
              │
              ▼
        LlmGateway                    harness/llm/          complete · read · loop
              │                       ONE implementation, provider-neutral
        StandardLlmGateway            spend ledger · run-log events · vision consensus
              │                       tool-turn budget · JSON salvage · role resolution
              ▼
        ModelBackend                  harness/llm/backend/  ◄── THE SEAM. Two methods.
              │
   ┌──────────┴───────────────┬─────────────────────────┐
   ▼                          ▼                         ▼
ChatCompletionsBackend    (your SDK backend)      (your gateway backend)
harness/llm/backend/chatcompletions/
```

`ModelBackend` is deliberately the *narrowest* thing that can still be called a model
call: **turns in, one completion out.** It is not the port because it was easy to draw
there — it is there because everything above it is provider-neutral and would otherwise
have to be reimplemented, correctly, by every integration.

**Do not put a second implementation at `LlmGateway`.** That interface was already a
port, so it has always been legal — it is simply ruinous. The one implementation carries
role resolution, the spend ledger, the run-log tape, the vision consensus, the tool-loop
budget and the JSON salvage, every one of which is neutral. A second `LlmGateway` has to
reproduce all of it, and the failure mode is silent: a gateway that forgets the ledger
works perfectly and quietly stops reporting money.

### What you inherit by implementing `ModelBackend` instead

| Inherited | Lives in | What it would cost to forget |
|---|---|---|
| Spend ledger (`helix_infra.model_call`) + price book | `StandardLlmGateway.record` | Every run reads as cheaper than it was |
| Run-log `llm_call` events on the SSE tape | same | A five-second gap nobody can diagnose |
| Vision consensus (N slots vote per field, lowest agreeing confidence wins) | `StandardLlmGateway.Consensus` | Redundancy silently becomes a single reading marked HIGH |
| Tool-turn budget, enforced in exactly one loop | `StandardLlmGateway.loop` | An unbounded agent loop against a paid API |
| JSON salvage (`LlmText.extractJson`) | `StandardLlmGateway.parseFields` | A model that wraps its JSON in prose fails the whole read |
| Role → slot resolution, first-claim-wins, startup diagnostics | `StandardLlmGateway` ctor | Which model answered depends on bean order |
| Images-before-instruction ordering | `StandardLlmGateway.readOne` | ~3× the input bill on every bundle, no error raised |
| Per-slot retry / throttle policy split | the backend's own business (see §6) | — |

---

## 2. The whole change, file by file

| # | File | New or edited | Rough size |
|---|---|---|---|
| 1 | `harness/llm/<yourlib>/YourBackend.java` | **new** | 120–200 lines |
| 2 | `harness/llm/<yourlib>/package-info.java` | **new** | why this package exists, what shape it speaks |
| 3 | `build.gradle.kts` | edited | one `implementation(...)` line |
| 4 | `application.yml` — `helix.models.text/vision.<slot>` | edited | reuse the existing slot shape, or add a block (§5) |
| 5 | `application.yml` — `helix.roles.*` | edited | point one role, or all of them, at the new handle |
| 6 | `.env.example` | edited | any new secret |

**Nothing else.** No stage, no rule, no controller, no prompt, no migration, no UI file.
The ArchUnit boundary rules make that structural rather than aspirational — a stage that
tried to name your backend would fail the build.

The two backends coexist: keep `ChatCompletionsBackend` enabled for the slots that still
speak that wire format and move roles across one at a time.

---

## 3. The two methods

```java
package com.tb.helix.harness.llm.yourlib;

@Component
public class YourBackend implements ModelBackend {

    private final Map<String, ModelHandle> handles = new LinkedHashMap<>();
    private final Map<String, YourSdkClient> clients = new LinkedHashMap<>();

    public YourBackend(LlmProperties props /*, whatever the library needs */) {
        props.allSlots().forEach((name, slot) -> {
            if (!slot.usable()) return;
            clients.put(name, /* build one client PER SLOT, once, with timeouts set */);
            handles.put(name, new ModelHandle(
                    name, slot.model(), slot.baseUrl(), slot.temperature(), slot.maxTokens()));
        });
    }

    @Override public String name() { return "your-lib"; }

    @Override public Optional<ModelHandle> handle(String id) {
        return Optional.ofNullable(handles.get(id));
    }

    @Override public Completion call(ModelHandle handle, Exchange exchange) {
        // 1. turns  → the library's message type, PRESERVING CONTENT ORDER
        // 2. tools  → the library's schema type. NEVER attach the handler
        // 3. hints  → apply, or have failed at startup (§4)
        // 4. send
        // 5. response → Completion, text passed through LlmText.clean(...)
    }
}
```

Register it as a `@Component`; `StandardLlmGateway` collects every `ModelBackend` bean and
asks each one whether a configured handle name is theirs. **Names must be unique across
backends** — two claimants is logged as an error at startup rather than left to classpath
order.

### The type mapping

| Ours (`harness/llm/backend/`) | What it is | Typical library equivalent |
|---|---|---|
| `Turn.System(text)` | how to behave, what shape the answer takes | system message / `system` parameter |
| `Turn.User(List<Content>)` | one question, **as ordered parts** | user message with content blocks |
| `Turn.Assistant(text, toolCalls)` | what the model said — may carry both | assistant message |
| `Turn.ToolResult(callId, name, content)` | what running a tool produced | tool / function result message |
| `Content.Text(text)` | words | text block |
| `Content.Image(mimeType, bytes)` | an image **in memory, never a path** | image block; base64 or a bytes field |
| `ToolSpec(name, description, parameters, handler)` | a tool the model may ask for | function/tool declaration — **read the first three fields only** |
| `Exchange.jsonOutput` | *ask* for JSON; a hint, never a guarantee | `response_format` / JSON mode |
| `Exchange.hints` | provider quirks, e.g. `enable_thinking:false` | whatever the library calls extra body |
| `Completion.text` | cleaned answer | run it through `LlmText.clean(...)` |
| `Completion.raw` | the provider's verbatim payload | keep it — see §7 |
| `Completion.cachedPromptTokens` | prompt-cache hit count | `prompt_tokens_details.cached_tokens` or equivalent; **null, not 0, when unavailable** |

`Turn` is a **sealed** interface, so your `switch` over it is checked by the compiler and
a fifth kind cannot be added without every backend being made to consider it.

---

## 4. The four obligations

These are in `harness/llm/backend/package-info.java` and are repeated here because **each
one is silent when broken.**

### 4.1 Content order is not advisory

A document read sends its **images before its instruction**, on purpose. One document is
read three times — `extract`, `extract.md`, `attest` — over byte-identical images
differing only in the trailing instruction. A provider's prefix cache matches from the
first content block, so images-first means passes two and three ride the prefix pass one
paid for, and the images are ~95% of the input.

A backend that reorders parts — **or hands them to a library that reorders them** —
roughly triples the input bill for `interpret` and raises no error anywhere.

> Many convenience APIs take `(prompt, images)` and assemble the message themselves,
> text first. **If that is the only entry point the library exposes, that library is not
> usable for the vision roles** without a lower-level escape hatch. Check this before
> committing to it, not after.
>
> Verify with `prompt_tokens_details.cached_tokens` on the second pass — the
> `helix_infra.model_call.cached_in` column, and the Run Cost drawer — not by reading the
> library's documentation.

### 4.2 A hint that cannot be applied must be reported, not dropped

`Exchange.hints` carries things like `enable_thinking:false`, which is what stops a
Qwen3-family model leaking its reasoning into structured output, and `enable_thinking:true`,
which the plan's governing call sets deliberately.

If the library has nowhere to put a hint, **say so at startup and fail loudly**. Silently
ignoring one degrades an extraction and looks exactly like nothing happened.

```java
if (!exchange.hints().isEmpty() && !sdkSupportsExtraBody) {
    throw new IllegalStateException(
        "Backend 'your-lib' cannot apply hints " + exchange.hints().keySet()
        + " — enable_thinking is not decoration");
}
```

### 4.3 Report the tokens you were given

Including `cachedPromptTokens` where the provider reports it. That figure is the only
evidence §4.1 is working, so a backend that could obtain it and does not is hiding the one
number that justifies the ordering.

Where a library genuinely does not surface usage — some managed gateways do not — say so
in the package note and expect the spend console to under-report. That is a real cost of
that library and should be weighed before choosing it, not discovered afterwards.

### 4.4 Never invoke a tool

`ToolSpec` arrives with an executable `handler` attached, because that is the type the
rest of the system uses. A backend reads `name`, `description` and `parameters` to build a
schema **and stops there.** Execution and the hard turn budget belong to the gateway.

> This is the single biggest hazard when adopting an agent framework. Most of them offer
> to run the tool loop for you, and taking that offer is exactly how an unbounded agent
> loop against a paid API gets back in. The predecessor service bypassed a framework's
> tool execution to get an enforceable budget back; it is not going behind a framework
> again.
>
> If the library only exposes a run-the-loop API and cannot be asked for a single turn,
> use it for `complete`/`read` and leave the `JUDGE`/planner tool role on a backend that
> can. Roles map to slots independently, so this is a config split, not a fork.

---

## 5. Configuration

### The default: reuse the slot shape

`LlmProperties.Slot` is not HTTP-specific. `base-url`, `api-key`, `model`, `temperature`,
`max-tokens`, timeouts, `max-retries` and `extra-body` describe *a configured model that
can answer*, which every integration has some form of. Reuse it and the change is:

```yaml
helix:
  models:
    text:
      llm-3:                      # a new numbered slot — nothing names a vendor
        enabled: true
        base-url: ${LLM_3_BASE_URL:}   # or the gateway's endpoint, or blank in-process
        api-key:  ${LLM_3_API_KEY:}
        model:    ${LLM_3_MODEL:}
        temperature: 0            # zero for anything cacheable, always
        max-tokens: 8192
        extra-body:
          enable_thinking: false

  roles:
    judge: [llm-3]                # ← moving a role across is THIS LINE
    plan:  [llm-3]
```

`ModelBackend.handle(id)` is what decides ownership. Your backend claims `llm-3`;
`ChatCompletionsBackend` does not, because that slot is not one it built a client for.
Moving the role back is the same line.

### When the library brings its own configuration

Some SDKs want their own property tree (a credentials profile, a project id, a deployment
name). Two options, in order of preference:

1. **Carry it in `extra-body`.** It already exists as the generic escape hatch and is
   merged into the request verbatim. A deployment name is a fact about one slot, and this
   keeps it there.
2. **Add a sibling block** — `helix.models.<yourlib>.*` — bound by your own
   `@ConfigurationProperties` record inside your package. Do **not** widen
   `LlmProperties.Slot` with a vendor field: teaching the shared type about one library is
   how every future library becomes a change to the shared type.

Either way, `helix.roles` stays the only place a role is pointed at a handle, and no code
outside your package learns the library exists.

---

## 6. Retries, timeouts and rate limits

These stay with the backend, because only the backend knows what its transport does.
`ChatCompletionsClient` is the worked example and the policy split is the part worth
copying:

| Budget | Answers | Set by |
|---|---|---|
| `slot.maxRetries` | "how many times is it worth asking again when something went wrong" | per-slot config (vision slots are deliberately 1 — a failed vision call is expensive) |
| `THROTTLE_RETRIES` (3, capped at 20 s) | "the provider told us to wait, so wait" — 429s only, honouring `Retry-After` | a constant; this is not the same question |

Two rules that are not negotiable:

- **Never retry a refusal.** A 4xx that is not 429 means the request is wrong and will be
  wrong again; retrying only spends the timeout budget before failing anyway.
- **Never swallow a failure.** Throw. `StandardLlmGateway` records the attempt, its
  latency and its error before deciding whether the call as a whole failed. A rule that
  concludes "pass" because the model was unreachable is the worst failure this system can
  have.

If the library retries internally, either turn that off or set `slot.max-retries: 0` so
the two budgets do not multiply. Two retry policies for one job is what this architecture
exists to avoid.

---

## 7. Two things that will bite

### 7.1 The derivation cache keys on model + endpoint, not on backend

`DerivationKey` names `modelId` and `providerUrl`, which is what keeps two providers
serving the same model name from sharing answers. It does **not** name the backend.

So: a new backend that reports the **same `model` string and the same `endpoint`** as the
old one will serve cached answers computed by the old one. That is usually what you want —
same model, same prompt, same answer. It is *not* what you want when the library changes
how the request is assembled (different default system framing, different image encoding),
because then the answer really could differ and the key says it cannot.

**When in doubt, bump the op version in `infra/cache/CacheOp` for the affected ops.** That
invalidates those ops alone rather than making everything recompute at once.

Related: a `ModelHandle` with a **null `endpoint`** (correct for an in-process backend)
puts null in the key. Two in-process backends serving the same model name would then
collide. Give a handle a stable synthetic endpoint — `inproc://your-lib` — rather than
leaving it null when more than one such backend could exist.

### 7.2 `Completion.text` must arrive cleaned, `raw` must arrive verbatim

`LlmText.clean` strips leaked `</think>` blocks and ```` ```json ```` fences. Call it. The
gateway's `extractJson` salvage runs on top of it, but the `Completion` contract says the
text is already cleaned, and downstream code that is handed a fence gets it as prose.

Keep `raw` verbatim regardless. When an answer is wrong the first question is always
"what did it actually return", and a cleaned string cannot answer it.

---

## 8. Verification checklist

There is no unit-test suite; the safety net is a clean compile, the ArchUnit rules and
running a real bundle. For a backend swap, run through this in order:

```bash
cd tb-helix-ai-svc && ./gradlew build     # compile + 14 boundary rules + MigrationTest
```

1. **Startup** — the log line `Model backends: [chat-completions, your-lib]`, and no
   `Role 'x' names unusable handle(s)` warning for the role you moved.
2. **One text role first** (`narrate` or `judge`), not the vision roles. Run a case; the
   Run Log should show a `llm_call` row with `slot`, `model`, `tokensIn/Out`, `ms`.
3. **The ledger** — `select backend, count(*), sum(tokens_in) from helix_infra.model_call
   group by backend`. A backend with rows and zero tokens is §4.3 broken.
4. **Then a vision role.** Read a three-page document and check
   `helix_infra.model_call.cached_in` on the second and third pass of the same document.
   Zero on all three is §4.1 broken — the images were reordered or re-encoded.
5. **Then the tool role** (the planner). `helix.check.plan.max-turns` is 4; confirm the
   run stops at 4 completions and does not sit there. A library running its own loop shows
   up as one call in the ledger and many minutes on the clock.
6. **A full bundle** from `test/cases/01-widgets-singapore/lc-amended.txt` — the one
   credit that reaches `execute` cleanly.

---

## 9. If the library speaks a genuinely different shape

Anthropic's Messages API (`/v1/messages`, content blocks, `stop_reason`) is a different
wire format, not a variant of this one. An agent framework or an in-process model is
different again and does not speak HTTP at all.

**None of that changes anything above the backend port.** Give it its own package beside
`chatcompletions/`, name the package for the *shape it speaks* rather than for the vendor
who published it — the package was called `openai` once, which read as though the service
had chosen a vendor when what it had chosen was a wire format that MiniMax, DashScope,
vLLM, Ollama, Together, Groq and Fireworks all implement — and implement `ModelBackend`.

That is where the vendor-neutrality lives: in the ports, not in a package's name.

---

## Reading order for whoever does this

1. `harness/llm/backend/package-info.java` — the four obligations, in the source.
2. `harness/llm/backend/ModelBackend.java` — the two methods.
3. `harness/llm/backend/chatcompletions/ChatCompletionsBackend.java` — the worked example, ~150 lines.
4. `harness/llm/StandardLlmGateway.java` — what you are inheriting, so you know not to rebuild it.
5. This document, for the parts that are decisions rather than code.
