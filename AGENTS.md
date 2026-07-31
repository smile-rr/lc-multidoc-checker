# v3-e2e-flow — Agent Spec (Source of Truth)

> **Cursor**: `.cursor/rules/v3-e2e-flow.mdc` auto-applies this context.  
> **Humans**: operational commands in [`Local-Startup.md`](Local-Startup.md).  
> **Monorepo**: shared v1/v2 conventions in [`../AGENTS.md`](../AGENTS.md).

## What this repo is

LC Checker **v3** end-to-end flow — multi-document LC examination (MT700 + PDFs), officer-paced 5-stage pipeline. Codebase forked from v2; **isolated by PostgreSQL schema `lc_v3`**.

## Quick start (Mac)

```bash
cp .env.example .env    # fill LLM_API_KEY, VISION_1/2_API_KEY
make up                     # db + svc + ui in the background
make status                 # → http://127.0.0.1:5174
```

| Service | Port | Command |
|---------|------|---------|
| Postgres | 5432 | `make db` / `make db-reset` |
| svc (tb-helix-ai-svc) | 9090 | `make svc` / `make watch` |
| ui (tb-helix-ai-ui) | 5174 | `make ui` |

`make help` lists everything. Logs from `make up` are in `/tmp/helix/`.

**Never** run `docker compose -f infra/docker-compose.yml` on Mac for local dev — Ubuntu production only. The Makefile no longer has deploy targets; they drove two services being deleted.

---

## Database model

| Layer | Name | Notes |
|-------|------|-------|
| PostgreSQL **database** | `lc_checker` | Shared with v1/v2 on same server |
| Application **schema** | `lc_v3` | v2 uses `lc_v2` — do not mix SQL |
| DDL source | `lc-checker-v2-svc/src/main/resources/db/schema.sql` | `spring.sql.init.mode=always` |
| Reset local | `make db-reset` + restart svc | Wipes container; recreates empty `lc_checker` |

Key tables: `check_sessions`, `documents`, `pipeline_steps`, `pipeline_events`, `officer_actions`, `vision_extract_cache`.

---

## Environment (`.env`)

Secrets + Mac overrides only. Operational config is in `application.yml`.

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lc_checker
DB_USERNAME=lcuser
DB_PASSWORD=...

LLM_API_KEY=...
VISION_1_API_KEY=...
VISION_2_API_KEY=...

STORAGE_MINIO_REQUIRED=false   # Mac: memory-only PDFs
LANGFUSE_ENABLED=false         # Mac: no OTLP to Ubuntu :3300
```

| Variable | Restart needed |
|----------|----------------|
| `.env` changes | Yes — `make svc-down && make svc` |
| `application.yml` / Java / resources | `make watch` hot-reload (~3s) |


---

## Pipeline architecture

Officer-paced stages (auto-run only **intake** on session create):

```
intake → parse → reconcile → examine → signoff
         ↑ each stage: AWAITING_OFFICER until POST /stages/{stage}/run
```

| Stage | Backend | UI panel |
|-------|---------|----------|
| intake | Classify docs, MT700 parse, S3/cache PDF bytes | `IntakePanel` |
| parse | Vision extract per doc (multi-slot consensus) | `ParsePanel` |
| reconcile | Field normalisation matrix | `ReconcilePanel` |
| examine | UCP/ISBP rules (SpEL + LLM tiers) | `ExaminePanel` |
| signoff | Report + MT734 | `SignoffPanel` |

**Code map**: `pipeline/PipelineService.java`, `pipeline/LcV2Pipeline.java`, `stage/*`, SSE via `PipelineEventChannel`.

---

## Vision parse cache

- **Enabled**: `vision.cache.enabled: true`
- **Storage**: PostgreSQL `lc_v3.vision_extract_cache` (90-day TTL, **cross-session**)
- **Key**: PDF SHA + prompt SHA + model + base URL + render params (`CacheKey`)
- **Hit**: log `cache-hit` / SSE `cache_hit` — skips VLM HTTP
- **Per-session results**: `lc_v3.pipeline_steps` (different from cross-session cache)

---

## Shared backend conventions (from monorepo)

- JDK 21, Spring Boot 3.5, Spring AI 1.1 (**text LLM only**)
- Vision LLM: **`RestClient`**, not Spring AI ChatClient
- Vision slots `VISION_1..4_*`; Bailian base URL `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Qwen3: `enable_thinking: false` at top-level request body
- Gradle vertical-slice packages, not layer packages

---

## Reference docs

| Doc | Use when |
|-----|----------|
| [`Local-Startup.md`](Local-Startup.md) | Make targets, hot-reload, troubleshooting |
| [`docs/reference/rule-catalog.md`](docs/reference/rule-catalog.md) | Rule IDs, tiers, triggers |
| [`docs/reference/doc-taxonomy.md`](docs/reference/doc-taxonomy.md) | Doc types, AI pitfalls |
| [`docs/code-review-guide.zh.md`](docs/code-review-guide.zh.md) | Deep architecture walkthrough |
| [`test/cases/`](test/cases/) | Preset bundles 01–04 (UI exposes 01–03) |

---

## Common false alarms

| Symptom | Cause | Fix |
|---------|-------|-----|
| Presets `500` | svc not ready | `make health`; use `make up` (waits for svc) |
| Intake "classifying" ~1 min | MinIO connect timeout | `STORAGE_MINIO_REQUIRED=false` |
| `HttpExporter` timeout `:3300` | Langfuse unreachable | `LANGFUSE_ENABLED=false` |
| `CONDITION EVALUATION DELTA` wall | DevTools restart log | Disabled in `application.yml` |

---

## Key paths

```
v3-e2e-flow/
├── AGENTS.md              ← this file (agent SoT)
├── CLAUDE.md              ← pointer for Claude Code
├── Local-Startup.md       ← human runbook
├── Makefile               ← all Mac dev commands
├── .env.example           ← secrets template
├── .cursor/rules/         ← Cursor auto-context
├── lc-checker-v2-svc/     ← Spring Boot backend
├── ui/                    ← React + Vite frontend
├── test/cases/            ← preset PDF bundles
├── infra/docker-compose.yml  ← Ubuntu prod only
└── docs/                  ← architecture & rules reference
```

---

## Agent workflow tips

1. Read this file + run `make status` before debugging "hangs" or 500s.
2. Prefer `make watch` when editing Java or `resources/`.
3. Do not commit `.env`; do not force-push without user request.
4. Minimize diff scope — match existing patterns in surrounding code.
5. Ubuntu production uses same `lc_checker` DB; deploy with `lc_v3` schema via updated svc image.
