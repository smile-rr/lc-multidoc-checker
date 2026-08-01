# v3-e2e-flow — Agent Spec (Source of Truth)

> **Humans**: operational commands in [`Local-Startup.md`](Local-Startup.md).
> **Architecture**: [`CLAUDE.md`](CLAUDE.md), and
> [`docs/architecture/package-layout.md`](docs/architecture/package-layout.md) for where a class goes.
> **Monorepo**: shared conventions in [`../CLAUDE.md`](../CLAUDE.md).

## What this repo is

LC Checker **v3** — multi-document LC examination (MT700 + PDFs), officer-paced six-stage
pipeline, with the rulebook authored in a Governance console beside it.

Two deployables, both here:

| | Port | Stack |
|---|---|---|
| `tb-helix-ai-svc` | 9090 | Spring Boot 3.5, JDK 21, Gradle (Kotlin DSL) |
| `tb-helix-ai-ui`  | 5174 | React 18 + Vite |

The predecessor pair — `lc-checker-v2-svc` and `ui/` — was **retired and deleted** (`fe161da`).
So was the separate `lc-governance-svc`; governance is a module inside the two above. Docs that
mention `com.lc.v2.checker`, `catalog.yml`, `schema.sql`, the `lc_v3` schema or the
`parse → reconcile → examine` stages describe that service and are stale.

**Where it stands.** All six stages run end to end against a real bundle; the rulebook is a
database and the console authors it; the outcome vocabulary is one word from the plan to the
advice; the model layer has a two-method backend seam and one backend behind it. Open, and known:
**no container build for either deployable** (`infra/` is v2 and dead), Windows dev is supported by
the application but not by the Makefile, catalogue pinning is still `LIVE` rather than `RELEASE`,
L2 Redis is built and switched off, and the seed is a deliberate working minimum (5 doc types,
8 checks, 4 examiners) rather than `full-catalogue.json` (15 doc types, 15 checks), which nothing
loads.

## Quick start (Mac / Linux)

```bash
cp .env.example .env    # fill LLM_1_API_KEY and VLM_1_API_KEY
make up                 # db + svc + ui in the background
make status             # → http://127.0.0.1:5174
```

| Target | Does |
|--------|------|
| `make up` / `make down` | all three, background / stop all three |
| `make db` · `db-reset` · `db-down` · `db-shell` | Postgres in Docker (`lc-checker-postgres`, `postgres:16-alpine`) |
| `make svc` · `watch` · `svc-down` | backend foreground / with DevTools hot-reload (~3s) / stop |
| `make ui` · `ui-down` | frontend foreground / stop |
| `make build` | compile the backend, run the boundary rules, build the UI |
| `make status` · `health` · `logs` | what is up (svc and ui are *fetched*, not just port-probed) · `/actuator/health` · follow |

`make help` lists everything. Logs from `make up` are in `/tmp/helix/` (`svc.log`, `ui.log`).

**`infra/docker-compose.yml` is dead.** It builds `lc-checker-v2-svc` and `ui/`, both deleted in
`fe161da`; running it fails at build. Neither deployable has a Dockerfile yet. The Makefile has no
deploy targets either — they drove services that no longer exist.

---

## Running on Windows, macOS, Linux — and in a container

The two deployables are platform-neutral and must stay that way. The **convenience layer is not**,
and that is the whole of the difference.

| | Portable | Notes |
|---|---|---|
| `tb-helix-ai-svc` | **yes** | `${user.home}`-rooted paths, never CWD-relative; `gradlew` and `gradlew.bat` both committed |
| `tb-helix-ai-ui` | **yes** | plain Vite on `127.0.0.1:5174` |
| `Makefile` | **no** | POSIX shell, `lsof`, `nc`, `seq`, `docker`, Colima. macOS/Linux, or Windows under WSL2 / Git Bash |
| `infra/docker-compose.yml`, `infra/postgres/` | **dead** | v2-era; reference deleted directories and a schema this service does not use |

### Windows dev without WSL2

`make` is a shortcut, not a dependency. Run the three pieces directly:

```
docker run -d --name lc-checker-postgres -p 5432:5432 ^
  -e POSTGRES_DB=lc_checker -e POSTGRES_USER=lcuser -e POSTGRES_PASSWORD=lcdev postgres:16-alpine
cd tb-helix-ai-svc && gradlew.bat bootRun
cd tb-helix-ai-ui  && npm install && npm run dev
```

Two things to know rather than discover:

- **Line endings.** There is no `.gitattributes`. Prompt text in `resources/prompts/*.st` is
  hashed into the derivation cache key, so a CRLF checkout produces a different `promptSha` and
  misses every entry a LF checkout stored — it looks like a cold cache that never warms. Set
  `core.autocrlf=input` **before** cloning.
- **`helix.blob.link-by-case` writes symlinks**, which Windows refuses without Developer Mode. It
  is best-effort — the blob store works, only the browsable `by-case/` mirror is skipped. Set it
  `false` to silence the warning.

### Postgres: container, native install, or a server — all three, no code change

The datasource is `.env` and only `.env`:

| Scenario | What to do |
|---|---|
| Docker Postgres (`make db`) — Mac/Linux default | nothing; `.env` defaults already match |
| Postgres installed natively (usual on Windows) | `.env` only. Create the database and role by hand. **`make db-reset` does not apply** — drop and recreate the database instead |
| Server-hosted Postgres (production) | `.env` only — point `DB_HOST` / `DB_PORT` at it |

One requirement in all three: **the role must be able to `CREATE SCHEMA`.** Flyway owns
`helix_infra`, `helix_check` and `helix_gov` and creates them on first start
(`spring.flyway.create-schemas: true`). Postgres 13+ in principle (built-in `gen_random_uuid()`,
stored generated columns); 16 is what runs and what is verified.

### If you containerise the service

Not done yet, and a known gap. When it is, three settings are not optional:

- `HELIX_BLOB_TIER=DB`, or mount a volume — the default blob root is under `${user.home}`, which
  is ephemeral in a container, and the thing being lost is evidence.
- `HELIX_CACHE_L3_STORAGE=DB` — otherwise every redeploy pays for every extraction again.
- Real `DB_HOST`/`DB_PORT`: the database is *not* part of the app's compose unit in production.

The UI is a static `dist/` behind any web server with `/api` proxied to the svc.

---

## Database model

| Layer | Name | Notes |
|-------|------|-------|
| PostgreSQL **database** | `lc_checker` | container, native install or a server — see above; `.env` decides |
| **Schemas** | `helix_check` · `helix_gov` · `helix_infra` | owned by Flyway; `helix_infra` holds `flyway_schema_history` |
| DDL source | `tb-helix-ai-svc/src/main/resources/db/migration/` | V1–V26 + `R__views.sql`. **Flyway, not `schema.sql`** |
| Reset local | `make db-reset` + restart svc | wipes the container; Flyway rebuilds and the seeder reloads the catalogue |

| Schema | Key tables |
|--------|-----------|
| `helix_check` | `lc_case`, `lc_document`, `lc_bundle_page`, `lc_fact`, `lc_mark`, `lc_plan_check`, `lc_finding`, `lc_step`, `lc_run_step`, `lc_event`, `lc_officer_action` |
| `helix_gov` | `document (kind, id, body jsonb)` — the whole catalogue, one table — plus `comment` and ten views |
| `helix_infra` | `blob` / `blob_ref` / `blob_content`, `derivation` (L3 cache), `model_call`, `model_price`, `model_price_band` |

Adding a migration: take the next `V<n>__` number. `MigrationTest` fails the build on a duplicate,
which is cheaper than finding out at `migrate()` time. **An applied migration cannot be edited** —
Flyway checksums it — so a correction is a new file. `V24` is a migration whose entire content is
`COMMENT ON COLUMN`, fixing a claim `V2` made that was never true.

What V23–V26 added, since they are recent and each changes behaviour:

| | |
|---|---|
| `V23` | `lc_case.credit_source_sha` — the original credit bytes, kept so a *scanned* credit can be transcribed on the intake thread. `credit_text_sha` stays the SWIFT dump everything downstream reads |
| `V24` | comments only. `lc_fact.value_norm` is **not** what rules compare — `RuleEvaluator` is handed `value` and parses per operator, because `USD60000,00` and `2026-07-30` are different jobs |
| `V25` | `outcome_reason` splits `UNANSWERABLE` into `NOT_PRESENTED` (the presentation's gap) and `NOT_EXTRACTED` (ours). Both still DOUBT; what changes is who has work to do |
| `V26` | `lc_case.run_mode` (`auto` \| `step`). It lived in one browser tab's reducer and reset to `auto` on every mount — so the one mode you choose *because* you want to be asked was the one that did not survive a reload |

---

## Environment (`.env`)

Secrets + per-machine overrides only — database coordinates, model keys, storage tier. Operational
config is hardcoded in `application.yml`. That split is what lets one jar run on a Mac, on Windows
and in a container with no profile per environment.

```dotenv
DB_HOST=localhost              # a container, a native install, or a server — all three
DB_PORT=5432
DB_NAME=lc_checker
DB_USERNAME=lcuser             # must be able to CREATE SCHEMA — Flyway owns three
DB_PASSWORD=lcdev

# Slots are numbered and uniform; nothing names a vendor. A provider switch is a
# base URL and a key. Roles map to slots under `helix.roles` in application.yml.
LLM_1_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_1_API_KEY=
LLM_1_MODEL=qwen3.7-flash
VLM_1_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VLM_1_API_KEY=
VLM_1_MODEL=qwen3.7-vl-flash

HELIX_BLOB_TIER=DISK           # DISK locally (browsable); DB on a server or in a container
HELIX_CACHE_L3_STORAGE=DISK    # DISK locally; DB for shared testing — and `application.yml`
                               # defaults to DB, so unset means DB
HELIX_CATALOG_PIN=LIVE         # LIVE: a Governance edit applies to the next run
HELIX_PLAN_THINKING=true       # reasoning on for the plan's governing call
```

| Changed | Restart needed |
|---------|----------------|
| `.env` | Yes — `make svc-down && make svc` |
| `application.yml` / Java / `resources` | No — `make watch` hot-reloads (~3s) |

> The top half of `.env.example` is still the v2 template (`VISION_1..4`, MinIO, Langfuse,
> Spring AI). Those variables are read by nothing in this repo. The `tb-helix-ai-svc` block at
> the bottom is the current one.

---

## Pipeline architecture

Officer-paced. Only **intake** runs by itself, on upload; every later stage sits at
`awaiting_officer` until someone POSTs `/stages/{stage}/run`.

```
intake → interpret → gate → plan → execute → signoff
          ↑ each one waits, except gate — it declares WITH_NEXT and rides with plan
```

| Stage | Does | UI tab |
|-------|------|--------|
| intake | accept the upload, convert, digest, parse the credit — **transcribing it first if it arrived as a scan** | Intake |
| interpret | segment the bundle, read the fields off each document | Interpret |
| gate | threshold checks — exact rules over the credit and the covering schedule | Plan & Execute |
| plan | requirements out of 46A/47A, rule selection, then **govern**: weigh both | Plan & Execute |
| execute | exact rules against the facts, judged rules grouped **one call per examiner** | Plan & Execute |
| signoff | aggregate decisions, generate the advice, route it | reached from Decision |

The five UI tabs and the six stages deliberately do not map one-to-one. The run bar is built from
`GET /api/v1/lc-check/pipeline`, so a stage added to the backend appears rather than vanishing.

**Code map**: `infra/pipeline/` (generic engine) · `lccheck/pipeline/DocCheckPipeline` ·
`lccheck/pipeline/StageLauncher` (gatekeeps, launches, settles) · `lccheck/stage/*` ·
SSE through `infra/stream` + `CaseController`.

### Things about the flow that surprise people

- **A threshold check does not halt the run.** It records a discrepancy and lets the plan read the
  credit — `:47A:` may extend the very presentation period it failed on. `lc_case.gate_halted` is
  legacy and nothing writes it.
- **The plan may stop the run short**, and says why in `lc_case.plan_decision`. The case still
  parks at `execute`, so the ordinary run button finishes it. There is no separate endpoint.
- **Auto mode ends at the Decision tab**, not Review. It stops at Review only when the plan holds
  a `coverage=HUMAN` item. Auto vs Step is `lc_case.run_mode` — on the case, not in the browser
  (`PUT /cases/{ref}/mode`).
- **A suppression always raises a review card.** The planner can stand a standing rule down for
  one credit, but only by handing the officer the question.
- **Judged checks are grouped by examiner, not asked one by one.** Each `helix_gov` agent is a
  *remit* — the domains it answers for, how it reads, the articles it answers to — and its whole
  group is one call. Four prompt layers, ordered by how likely each is to change; the first group
  runs **alone** and the rest fan out behind it, because every group opens with the same fact
  sheet and a provider only holds that prefix once a call carrying it has returned. Turning this
  into "all in parallel" raises the bill, it does not lower it.
- **Tools go to the planner, not the examination.** The examination already holds its facts; the
  planner *writes* conditions and cannot tell whether they will be accepted, so `check_condition`
  closes that loop inside the call (`PlannerTools`). An invalid condition silently demoted to a
  judged card costs a model call on every presentation for ever.
- **A check that did not settle must not roll up as clean.** All three rule outcomes are recorded,
  through one mapping gate and execute share. "No finding" is not "nothing wrong".
- **What a check *is*, is derived.** A condition using `noconflict`, `same_party`, `same_country`
  or `addr_same_country` is JUDGED whatever its author typed, and a judged check can never be a
  threshold check — gating on a judgement spends the money the gate exists to save. The console
  renders the derived tier; it never re-derives it in the browser.

---

## Derivation cache

- **What**: every expensive op declares a `DerivationKey` and is looked up *before* any bytes are
  read or any HTTP request built. Ops and versions are constants in `infra/cache/CacheOp`.
- **Tiers**: L1 Caffeine (in-process) · L2 Redis (built, switched off) · L3 durable.
- **L3 storage**: `HELIX_CACHE_L3_STORAGE` — `DISK` locally (JSON + `.md` raw text under
  `~/ws/tmp/var/derivation/`), `DB` for shared testing (`helix_infra.derivation`).
- **Invalidating one op**: bump that op's version in `CacheOp`. A single global version makes
  every unrelated op recompute at once.
- **Hit**: logged, and announced on the stream as `llm_cached` by the cache itself — no stage
  emits it.
- Correctness depends on the underlying call being deterministic, which is why every cacheable
  model request goes at temperature 0.
- **The key names the prompt *text*, the model and the provider URL — not the backend.** Two
  consequences worth knowing before they cost a day: a CRLF checkout on Windows hashes to a
  different `promptSha` and misses everything a LF checkout stored; and moving a role to a new
  integration that reports the same model and endpoint will happily serve the old one's answers.
  Bump the op version when the request assembly, not just the transport, changed.

---

## Backend conventions

- JDK 21, Spring Boot 3.5. **No Spring AI, no JPA, no SpEL evaluation.**
- Four layers, downward only: `infra` → `harness` → `governance` + `lccheck` → `app`.
  `lccheck` sees `governance.types` and `governance.spi` and nothing else. 14 ArchUnit rules
  enforce it; `./gradlew test` fails the build on a violation.
- Domain code names an LLM **role** — `SEGMENT, EXTRACT, READ_TEXT, TRANSCRIBE, PLAN, JUDGE,
  NARRATE` — never a slot. Slots are numbered and uniform; nothing in the code names a vendor.
  `helix.roles` (beside `helix.models`, not inside it) maps roles to slots.
- Qwen3 needs `enable_thinking: false`, carried in the slot's `extra-body`. The one deliberate
  exception is the plan's governing call (`TextRequest.thinking(...)`).
- All lc-check SQL lives in `lccheck/persistence/CaseStore.java`. A row never escapes the
  persistence package.
- Prompts are `resources/prompts/*.st`, re-read every call because the text is hashed into the
  cache key. Build long ones with `harness/llm/text/PromptContext` — stable blocks first, so a
  provider's prefix cache can hit.

### Adding an LLM provider, SDK or gateway

The seam is `harness/llm/backend/ModelBackend` — **two methods**, and everything provider-neutral
(spend ledger, run-log events, vision consensus, tool-turn budget, JSON salvage, role resolution)
is inherited from `StandardLlmGateway` rather than reimplemented. The whole change is one class
plus one line of YAML; no stage, rule, controller, prompt, migration or UI file moves.

**Do not add a second `LlmGateway`** — legal, and ruinous: everything above the backend port would
have to be reproduced, and forgetting the ledger is silent.

Full procedure, type-mapping table, the four obligations and the verification checklist:
[`docs/architecture/llm-integration.md`](docs/architecture/llm-integration.md). Read it before
adopting any library that offers to run the tool loop for you, or that takes `(prompt, images)`
and assembles the message itself.

## Frontend conventions

- React 18 + Vite + react-router. **No CSS framework** — inline styles over tokens in
  `shared/styles/tokens.css`.
- `shared/ds/` is the design system (~40 components). **Never hand-roll what it covers**; the
  inventory is in `tb-helix-ai-ui/README.md`, which is also the design document for the workbench.
- `VITE_DATA_SOURCE` is `mock` (default) or `api`, switchable per endpoint through
  `api/*Adapter.js`. The fixtures are the design.
- Vocabulary the service owns is **served, not restated**: the run bar comes from
  `GET /lc-check/pipeline`, the operator list from the governance API (`shared/lib/operators.js`),
  the check tier from the served value. A second opinion about a derivation is how the two come to
  disagree.
- `npm run smoke` renders 30 targets headlessly — 9 routes, one mid-run intake, and 10
  screens/panels in each of a fresh and a finished run state. It is the UI's only test.

---

## Verification

There is no unit-test suite. The safety net is:

```bash
cd tb-helix-ai-svc && ./gradlew build     # compile + 14 ArchUnit rules + MigrationTest
cd tb-helix-ai-ui  && npm run smoke && npm run build
```

Then run it against `test/cases/01–03`. `01-widgets-singapore/lc-amended.txt` is the one credit
that reaches `execute` cleanly; the plain `lc.txt` files all expired in 2025 and fail the
threshold check — which is a useful case in its own right, not a broken fixture.

---

## Reference docs

| Doc | Use when | Fresh? |
|-----|----------|--------|
| [`CLAUDE.md`](CLAUDE.md) | architecture, and the commands you actually run | yes |
| [`docs/architecture/package-layout.md`](docs/architecture/package-layout.md) | where a class goes; which ArchUnit rule enforces what | yes |
| [`docs/architecture/llm-integration.md`](docs/architecture/llm-integration.md) | putting a library, SDK or gateway behind the model calls instead of raw HTTP | yes |
| [`architecture-package-guideline.md`](architecture-package-guideline.md) | the generic reasoning behind the layering | yes |
| [`tb-helix-ai-ui/README.md`](tb-helix-ai-ui/README.md) | UI vocabulary, card kinds, the design system inventory | mostly — the API seam section predates the v2 retirement (`/api` goes to `:9090`, not 9082), and `state/severity.js` is now `stages.js` + `outcome.js` |
| [`Local-Startup.md`](Local-Startup.md) | Make targets, hot-reload, troubleshooting (中文) | mostly — log path and title are v2; Mac/Linux only |
| [`LC-Check.md`](LC-Check.md) | the product: what an examiner does and why | product-level, still valid |
| [`docs/reference/`](docs/reference/), [`docs/architecture/rule-set.md`](docs/architecture/rule-set.md), [`docs/workflow.md`](docs/workflow.md), [`docs/architecture.md`](docs/architecture.md), [`README.md`](README.md) | — | **v2-era, stale** |
| `infra/docker-compose.yml`, `infra/postgres/` | — | **dead** — build two deleted directories |

---

## Common false alarms

| Symptom | Cause | Fix |
|---------|-------|-----|
| Case sits at "Reading…" on upload | intake is running; the workbench opens a stream on `runState.busy` | wait, or `make logs` |
| Every check reports "not covered" | the dictionary has no bindings for the presented doc types | reseed (`make db-reset`) or author them in Governance |
| A gate never fires | it stopped being *eligible* — an operand moved onto a presented document | Governance → the check → the reason is on the disabled toggle |
| Plan produces no requirement cards | the credit has no `:46A:`/`:47A:` text, or the model call failed | check `lc_step` for the `requirements` row |
| Model answers look stale after a prompt edit | the prompt text is hashed into the cache key, so it should not — unless the *op version* is what changed | bump the op in `CacheOp` |
| `CONDITION EVALUATION DELTA` wall | DevTools restart log | already disabled in `application.yml` |
| A check reports doubt with "not extracted" | the document *is* presented and we failed to read the field — ours, not the presentation's | check the dictionary binding, then the extraction prompt. `NOT_PRESENTED` is the other case and means a missing document |
| A check returns INCONCLUSIVE for ever and looks like it ran | an operand names a real document and a field nobody reads off it | `v_dangling_reference` reports exactly this class |
| Case reopens in Auto after you chose Step | fixed in `V26` — `run_mode` is on the case now. If it still happens, the `PUT /cases/{ref}/mode` call failed | check the network tab, not the reducer |
| Cache never warms on a Windows checkout | CRLF line endings change `promptSha` | `core.autocrlf=input`, then re-clone |
| `docker compose -f infra/docker-compose.yml` fails to build | it references `lc-checker-v2-svc/` and `ui/`, deleted in `fe161da` | there is no container build yet; run natively |

---

## Key paths

```
v3-e2e-flow/
├── AGENTS.md                  ← this file (agent SoT)
├── CLAUDE.md                  ← architecture for Claude Code
├── Local-Startup.md           ← human runbook (中文, Mac/Linux)
├── Makefile                   ← Mac/Linux dev commands (Windows: gradlew.bat + npm directly)
├── .env.example               ← secrets template
├── tb-helix-ai-svc/           ← Spring Boot backend (:9090)
│   ├── gradlew / gradlew.bat  ← both committed; the build runs on either OS
│   └── src/main/
│       ├── java/com/tb/helix/ ← infra → harness → governance + lccheck → app
│       │   └── harness/llm/backend/  ← THE model-integration seam. Two methods
│       └── resources/
│           ├── db/migration/  ← Flyway V1–V26 + R__views.sql
│           ├── prompts/*.st   ← every model instruction (hashed into the cache key)
│           └── seed/          ← initial-catalogue.json (loaded) · full-catalogue.json (not)
├── tb-helix-ai-ui/            ← React + Vite frontend (:5174)
│   ├── README.md              ← the UI design document
│   └── src/{platform,shared,modules}/
├── test/cases/                ← bundles 01–03
├── infra/                     ← DEAD: v2 compose + v2 postgres scripts. No container build exists
└── docs/                      ← mixed freshness; see the table above
```

---

## Agent workflow tips

1. Read this file, then `make status`, before debugging "hangs" or 500s.
2. Prefer `make watch` when editing Java or `resources/`.
3. Do not commit `.env`; do not force-push without user request.
4. Minimize diff scope — match the patterns in the surrounding code, including its comment style.
5. Before adding a package or moving a class, read `docs/architecture/package-layout.md`. The
   build will tell you if you were wrong, but it will not tell you what the rule was for.
6. Before adding an LLM call, check whether a lower tier can answer it. The cheapest correct
   answer is the one to reach for, and `PROGRAMMATIC` is free.
7. Do not introduce a path, a shell command or a tool that only works on one OS. Both deployables
   are meant to build and run on Windows, macOS and Linux, and in a container; the Makefile is the
   one deliberate exception and it is a convenience, not a dependency.
8. Before wiring any model integration, read `docs/architecture/llm-integration.md`. The seam is
   `ModelBackend` and the four obligations on it are all silent when broken.
