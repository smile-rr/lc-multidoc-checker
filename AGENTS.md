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

## Quick start (Mac)

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

**Never** run `docker compose -f infra/docker-compose.yml` on Mac — Ubuntu production only. The
Makefile has no deploy targets; they drove services that no longer exist.

---

## Database model

| Layer | Name | Notes |
|-------|------|-------|
| PostgreSQL **database** | `lc_checker` | local container is this repo's own |
| **Schemas** | `helix_check` · `helix_gov` · `helix_infra` | owned by Flyway; `helix_infra` holds `flyway_schema_history` |
| DDL source | `tb-helix-ai-svc/src/main/resources/db/migration/` | V1–V19 + `R__views.sql`. **Flyway, not `schema.sql`** |
| Reset local | `make db-reset` + restart svc | wipes the container; Flyway rebuilds and the seeder reloads the catalogue |

| Schema | Key tables |
|--------|-----------|
| `helix_check` | `lc_case`, `lc_document`, `lc_bundle_page`, `lc_fact`, `lc_mark`, `lc_plan_check`, `lc_finding`, `lc_step`, `lc_run_step`, `lc_event`, `lc_officer_action` |
| `helix_gov` | `document (kind, id, body jsonb)` — the whole catalogue, one table — plus `comment` and ten views |
| `helix_infra` | `blob` / `blob_ref` / `blob_content`, `derivation` (L3 cache), `model_call`, `model_price`, `model_price_band` |

Adding a migration: take the next `V<n>__` number. `MigrationTest` fails the build on a duplicate,
which is cheaper than finding out at `migrate()` time.

---

## Environment (`.env`)

Secrets + Mac overrides only. Operational config is hardcoded in `application.yml`.

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lc_checker
DB_USERNAME=lcuser
DB_PASSWORD=lcdev

# Slots are numbered and uniform; nothing names a vendor. A provider switch is a
# base URL and a key. Roles map to slots in application.yml.
LLM_1_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_1_API_KEY=
LLM_1_MODEL=qwen3.7-flash
VLM_1_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VLM_1_API_KEY=
VLM_1_MODEL=qwen3.7-vl-flash

HELIX_BLOB_TIER=DISK           # DISK locally (browsable); DB on the server
HELIX_CACHE_L3_STORAGE=DISK    # DISK locally; DB for shared/system testing
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
| intake | accept the upload, convert, digest, parse the credit | Intake |
| interpret | segment the bundle, read the fields off each document | Interpret |
| gate | threshold checks — exact rules over the credit and the covering schedule | Plan & Execute |
| plan | requirements out of 46A/47A, rule selection, then **govern**: weigh both | Plan & Execute |
| execute | exact rules against the facts, judged rules through a model | Plan & Execute |
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
  a `coverage=HUMAN` item.
- **A suppression always raises a review card.** The planner can stand a standing rule down for
  one credit, but only by handing the officer the question.

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

---

## Backend conventions

- JDK 21, Spring Boot 3.5. **No Spring AI, no JPA, no SpEL evaluation.**
- Four layers, downward only: `infra` → `harness` → `governance` + `lccheck` → `app`.
  `lccheck` sees `governance.types` and `governance.spi` and nothing else. 14 ArchUnit rules
  enforce it; `./gradlew test` fails the build on a violation.
- Domain code names an LLM **role**, never a slot. Slots are numbered and uniform; nothing in the
  code names a vendor.
- Qwen3 needs `enable_thinking: false`, carried in the slot's `extra-body`. The one deliberate
  exception is the plan's governing call (`TextRequest.thinking(...)`).
- All lc-check SQL lives in `lccheck/persistence/CaseStore.java`. A row never escapes the
  persistence package.
- Prompts are `resources/prompts/*.st`, re-read every call because the text is hashed into the
  cache key. Build long ones with `harness/llm/text/PromptContext` — stable blocks first, so a
  provider's prefix cache can hit.

## Frontend conventions

- React 18 + Vite + react-router. **No CSS framework** — inline styles over tokens in
  `shared/styles/tokens.css`.
- `shared/ds/` is the design system. **Never hand-roll what it covers**; the inventory is in
  `tb-helix-ai-ui/README.md`, which is also the design document for the workbench.
- `VITE_DATA_SOURCE` is `mock` (default) or `api`, switchable per endpoint through
  `api/*Adapter.js`. The fixtures are the design.
- `npm run smoke` renders 29 targets headlessly. It is the UI's only test.

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
| [`tb-helix-ai-ui/README.md`](tb-helix-ai-ui/README.md) | UI vocabulary, card kinds, the design system inventory | yes |
| [`architecture-package-guideline.md`](architecture-package-guideline.md) | the generic reasoning behind the layering | yes |
| [`Local-Startup.md`](Local-Startup.md) | Make targets, hot-reload, troubleshooting (中文) | mostly — log path and title are v2 |
| [`LC-Check.md`](LC-Check.md) | the product: what an examiner does and why | product-level, still valid |
| [`docs/reference/`](docs/reference/), [`docs/architecture/rule-set.md`](docs/architecture/rule-set.md), [`docs/workflow.md`](docs/workflow.md), [`docs/architecture.md`](docs/architecture.md), [`README.md`](README.md) | — | **v2-era, stale** |

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

---

## Key paths

```
v3-e2e-flow/
├── AGENTS.md                  ← this file (agent SoT)
├── CLAUDE.md                  ← architecture for Claude Code
├── Local-Startup.md           ← human runbook (中文)
├── Makefile                   ← all Mac dev commands
├── .env.example               ← secrets template
├── tb-helix-ai-svc/           ← Spring Boot backend (:9090)
│   └── src/main/
│       ├── java/com/tb/helix/ ← infra → harness → governance + lccheck → app
│       └── resources/
│           ├── db/migration/  ← Flyway V1–V19 + R__views.sql
│           ├── prompts/*.st   ← every model instruction
│           └── seed/          ← initial-catalogue.json
├── tb-helix-ai-ui/            ← React + Vite frontend (:5174)
│   ├── README.md              ← the UI design document
│   └── src/{platform,shared,modules}/
├── test/cases/                ← bundles 01–03
├── infra/docker-compose.yml   ← Ubuntu prod only
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
