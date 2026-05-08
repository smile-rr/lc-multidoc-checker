# v2 Spike Plan — File-Level Implementation

**Status:** Phase 2 deliverable (2). No code changes yet — this is the
agreed plan. Implementation begins on signal.
**Date:** 2026-05-07
**Companions:** `production-readiness.md` (architecture) · `rule-set.md`
(SoT for the 18 rules + COND-DYN).

---

## 0. Decisions baked in

From `rule-set.md` §9, all four decisions confirmed:

1. **18 static rules + 1 AGENTIC dynamic generator** — accepted.
2. **Severities** — accepted as currently labelled.
3. **`CERT-01` keeps BC + WC unified** — one rule, two trigger paths.
4. **`GEN-001` dissolves entirely** — UCP 14(a) is the corpus the entire
   examine stage operates under; restating it as a rule is noise.

Type taxonomy (4): `PROG` · `AGENT` · `AGENT_TOOL` · `AGENTIC`.
`PROG_AGENT` is removed.

---

## 1. Workstream summary and dependencies

```
       ┌────────────────────────────────────────────────┐
       │  W1  FieldEnvelope schema (raw_quote, OSI)     │   foundation
       └──────┬─────────────────────────────────────────┘
              │
       ┌──────┴──────┐    ┌──────────────────────────────┐
       │  W2 prompts │    │  W3 citation single-source   │   parallel
       └──────┬──────┘    └──────┬───────────────────────┘
              │                  │
       ┌──────┴──────────────────┴───────────┐
       │  W4 catalog rewrite (18 rules)      │
       │  W5 NOT_APPLICABLE cascade          │   parallel
       └──────┬──────────────────────────────┘
              │
       ┌──────┴──────────────────────────────┐
       │  W6 COND-DYN AGENTIC decomposer     │
       └──────┬──────────────────────────────┘
              │
       ┌──────┴──────────────────────────────┐
       │  W7 verification corpus             │
       └─────────────────────────────────────┘
```

Each workstream has objective acceptance criteria. Land one before
starting any downstream workstream. Within a parallel pair (W2 + W3,
W4 + W5), the two can land independently.

---

## 2. W1 — FieldEnvelope schema: provenance + open-world

**Goal.** Every extracted value carries the verbatim source text.
Unschematized findings live in a structured open-world list. Without
this, downstream rules cannot quote evidence to officers or auditors.

### Files to touch

| File | Change |
|---|---|
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/common/FieldEnvelope.java` | Add `String rawQuote`, `Integer page`, `BBox bbox` (nullable record), keep existing `value`, `confidence`, `source`. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/document/DocumentExtract.java` | Add `List<OffSchemaItem> offSchemaItems` to top-level extract output. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/document/OffSchemaItem.java` | New record — `{rawQuote, page, bbox, confidence, tags[]}`. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/common/BBox.java` | New record — `{int x, y, w, h}`, all nullable since not all vision providers return bboxes. |
| `lc-checker-v2-svc/src/main/resources/fields/field-pool.yaml` | No structural change; new fields added per rule (see W4 evidence shapes) — but the schema additions land here. |

### Persistence

`pipeline_steps(stage='parse', step_key='consensus:<doc_type>').result`
already stores JSONB. The new fields land inside the consensus blob;
the `v_doc_extracts_consensus` view exposes them. Migration:

| Concern | Resolution |
|---|---|
| Existing rows in production DB | Keep; new fields are nullable. New runs populate. |
| `field-pool.yaml` consumer code | `FieldPoolRegistry` reads field defs; no schema migration needed there — only `FieldEnvelope` carries the new wire shape. |

### Acceptance criteria

1. A fresh session against `test/cases/01/` produces extracts where every
   field that has a value also has a non-null `rawQuote` matching the
   verbatim text the model claims it saw.
2. `offSchemaItems` is non-null on every consensus extract (may be empty
   list, but never `null`).
3. `v_doc_extracts_consensus` returns `raw_quote` and `off_schema_items`
   columns/keys; existing UI code continues to render without crash
   (fields it doesn't know about are ignored).
4. `./gradlew compileJava` clean.

### Deferred (not in W1)

- BBox visualization in UI (overlay on PDF view).
- Quoted-evidence rendering in officer discrepancy view (W7 territory).

---

## 3. W2 — Six extract prompts: provenance + open-world + domain coaching

**Goal.** Every prompt asks for `raw_quote` per field; emits
`off_schema_items` for everything potentially LC-relevant outside the
predefined schema; INV/BOE/PKL gain UCP/ISBP-flavored coaching the
audit found missing.

### Files to touch

| File | Change |
|---|---|
| `prompts/extract/inv-extract-vision.st` | Add raw_quote, OSI shape; **add coaching**: ports of loading/discharge fields when present (XD-024 needs them); Incoterm normalization; trade-term + price clause distinction; explicit applicant/beneficiary roles. |
| `prompts/extract/bol-extract-vision.st` | Add raw_quote, OSI shape; coaching already strong, refine to call out `bl_form_type` field explicitly (W4 evidence shape). |
| `prompts/extract/pkl-extract-vision.st` | Add raw_quote, OSI shape; **add coaching**: per-carton breakdown structure (XD-01); shipping-marks block (XD-01); consolidation/master-pack distinction. |
| `prompts/extract/boe-extract-vision.st` | Add raw_quote, OSI shape; **add coaching**: tenor parsing — distinguish "X DAYS AFTER B/L DATE" / "X DAYS AFTER SIGHT" / "DUE date"; drawn-on party identity discipline; tenor-start-date reference. |
| `prompts/extract/bc-extract-vision.st` | Add raw_quote, OSI shape; coaching already strong. |
| `prompts/extract/wc-extract-vision.st` | Add raw_quote, OSI shape; coaching already strong. |

### Prompt template additions (common)

Each prompt gains the same skeleton at the bottom:

```
PROVENANCE
----------
For every field you populate, set "raw_quote" to the verbatim text from
the document that supports the value. Use the source string as it
appears (preserve original case, punctuation, line breaks within the
quote). If you can supply a page number, set "page". If your provider
returns bounding boxes, set "bbox" as {x,y,w,h}.

OPEN-WORLD CAPTURE
------------------
Populate "off_schema_items" with EVERY notation, stamp, or clause on
the document that could plausibly bear on an LC compliance check, even
if it does not match a predefined field. Each item is:
  {raw_quote, page, bbox, confidence, tags[]}
Examples of items to capture: hand-stamped freight clauses, defect
notations on transport docs, additional certifications, contract
references, package marks, pre-printed warranties.
```

### Acceptance criteria

1. All 6 prompts compile under the templating engine; manual run on
   `test/cases/01/inv-pass.pdf` returns valid JSON.
2. The returned JSON for INV contains at least one `off_schema_items[]`
   entry on a representative page-2-clause sample (Incoterm-rich invoice).
3. INV prompt explicitly mentions ports / Incoterm / trade-term hints
   (grep verifies).
4. BOE prompt explicitly mentions tenor-form distinction (grep verifies).
5. PKL prompt explicitly mentions per-carton + marks (grep verifies).

### Deferred

- Translating prompts to additional languages.
- Few-shot examples for ambiguous cases — Phase 3.
- Cross-prompt consistency tooling (e.g., shared header partial).

---

## 4. W3 — Citation single source of truth

**Goal.** UCP/ISBP text lives only in `refs/ucp600.yaml` and
`refs/isbp821.yaml`. Catalog rules and check-prompt files reference
them by id; `{{ref.X.text}}` and `{{ref.X.heading}}` resolve at runtime.

### Files to touch

| File | Change |
|---|---|
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/infra/refs/ArticleRefRegistry.java` | Already loads both YAMLs. Add `String resolve(String tokenExpr)` and a Spring AI `PromptTemplate` post-processor or a lightweight string-substitution hook that runs before ChatClient submission. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/AgentRuleExecutor.java` | Inject `ArticleRefRegistry`. Before sending prompt, run `{{ref.UCP-14-c.text}}` substitution. |
| `lc-checker-v2-svc/src/main/resources/rules/catalog.yml` | Remove all `ucp_excerpt:` inline text (24 occurrences). Replace with `ucp_refs: [UCP-14-c, …]` only. |
| `prompts/check/*.st` (7 files exist; W4 may add more) | Replace any inline UCP/ISBP excerpts with `{{ref.X.text}}` tokens. |

### Token grammar

```
{{ref.<id>.text}}      → full paragraph text
{{ref.<id>.heading}}   → heading
{{ref.<id>.id}}        → id (echoes; useful for "see {{ref.UCP-14-c.id}}")
```

If a token references an unknown id at execution time, the executor
fails fast with a clear error (rule lifecycle bug). No silent fallback.

### Acceptance criteria

1. `grep -c ucp_excerpt catalog.yml` returns 0.
2. A check-prompt template containing `{{ref.UCP-14-c.text}}` resolves
   to the actual UCP 14(c) text at execution time (verify via single
   rule run + log of submitted prompt).
3. Removing an entry from `ucp600.yaml` and re-running causes a
   deterministic, descriptive error on rules that cite the missing id
   (no NPE, no silent skip).
4. `./gradlew compileJava` clean.

### Deferred

- Multi-corpus support (UCP 600 + future UCP versions, eUCP, etc.).
- Citation linting (pre-commit hook that flags rules with no citation).

---

## 5. W4 — Catalog rewrite: 18 rules with new trigger semantics

**Goal.** `catalog.yml` becomes the SoT in `rule-set.md`. The 18 rules
land with new trigger fields, citations by id only, evidence shapes
documented, and prompt-instruction templates referencing
`{{ref.X.text}}`.

### New schema for a rule entry

```yaml
- rule_id: TRANS-01
  name: "B/L bears on-board notation and date"
  category: TRANSPORT
  enabled: true
  version: 1
  severity: CRITICAL
  polarity: POSITIVE
  waivable: false

  triggers:
    required_docs: [BOL]
    optional_docs: []
    lc_pre_conditions: []          # empty → always evaluable when required_docs present

  ucp_refs: [UCP-20-a-ii]
  isbp_refs: []

  check_type: PROG
  expression: |
    T(com.lc.v2.checker.stage.examine.MultiDocHelpers).bolOnBoardCheck(
      #docs['BOL'])
  output_schema: |
    {"verdict":"PASS|FAIL|DOUBTS","explanation":"<one sentence with raw_quote>"}

  evidence_shape:
    BOL:
      - bl_form_type             # "received_for_shipment" | "shipped_on_board"
      - on_board_notation        # raw_quote of the notation
      - on_board_date
      - issue_date
      - vessel_name

  eval_cases:
    - id: TRANS-01-pos-01
      scenario: "Received-for-shipment B/L with separate signed on-board notation 2026-04-10"
      expected: PASS
    - id: TRANS-01-neg-01
      scenario: "Received-for-shipment B/L; no separate on-board notation"
      expected: FAIL
```

### Files to touch

| File | Change |
|---|---|
| `lc-checker-v2-svc/src/main/resources/rules/catalog.yml` | Full rewrite: 18 rules per `rule-set.md`. Old `triggers: any_of/all_of` shape replaced by `required_docs / optional_docs / lc_pre_conditions`. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/rule/Rule.java` | Update record to match new schema; backward compatibility deferred — prod hasn't shipped catalog format guarantees. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/infra/rules/RuleCatalogRegistry.java` | Update YAML mapper; add validation that every rule cites at least one of `ucp_refs`/`isbp_refs` (W3 prereq). |
| `lc-checker-v2-svc/src/main/resources/prompts/check/*.st` | Authored or rewritten per `rule-set.md` Type — AGENT rules get one .st file each. Total ~10 files. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/MultiDocHelpers.java` | Add SpEL helper methods that the 6 PROG rules call (e.g., `bolOnBoardCheck`, `dateWindow`, `crossDocQuantity`). |

### The 18 rules — file inventory

| Rule | Type | New .st? | New SpEL helper? |
|---|---|---|---|
| DATE-01 | PROG | — | yes |
| DATE-02 | AGENT_TOOL | yes | (uses date-arithmetic tool) |
| DATE-03 | PROG | — | yes |
| AMT-01 | AGENT_TOOL | yes | (uses calculator tool) |
| AMT-02 | PROG | — | yes |
| DOCSET-01 | AGENT | yes | — |
| DOCSET-02 | PROG | — | yes |
| GOODS-01 | AGENT | yes | — |
| TRANS-01 | PROG | — | yes |
| TRANS-02 | AGENT | yes | — |
| TRANS-03 | AGENT | yes | — |
| TRANS-04 | AGENT | yes | — |
| PARTY-01 | AGENT | yes | — |
| PARTY-02 | AGENT | yes | — |
| XD-01 | PROG | — | yes |
| XD-02 | AGENT | yes | — |
| CERT-01 | AGENT | yes | — |
| CERT-02 | AGENT | yes | — |

10 new/rewritten `.st` files. 7 new SpEL helpers.

### Acceptance criteria

1. `RuleCatalogRegistry` loads 18 active rules at startup with no
   warnings; no rule is `enabled: false`.
2. Every rule has at least one `ucp_refs[]` or `isbp_refs[]` entry.
3. Every rule has a non-empty `evidence_shape`.
4. Every rule has at least one PASS and one FAIL eval case.
5. End-to-end run on `test/cases/01/` produces 18 `CheckResult` rows
   (or NOT_APPLICABLE per W5 if input docs absent).
6. `./gradlew compileJava` clean.

### Deferred

- Tuning the AGENT prompts via empirical eval (Phase 3).
- Bank-specific severity overrides (post-launch).
- Rule lifecycle UI updates to surface new trigger fields.

---

## 6. W5 — NOT_APPLICABLE cascade in rule executor

**Goal.** Implement the trigger semantics from `rule-set.md` §1 and §2.
Missing required input → NOT_APPLICABLE with reason. Missing
LC pre-condition → NOT_APPLICABLE with reason. Never silent skip.

### Files to touch

| File | Change |
|---|---|
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/ExamineStage.java` | Pre-check each rule: if any `required_docs` absent, emit `CheckResult{verdict: NOT_APPLICABLE, reason: "input doc <X> not presented (see DOCSET-01)"}` and skip evaluation. Same for `lc_pre_conditions`. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/result/CheckResult.java` | Add `String reason` field (nullable). For NOT_APPLICABLE, populated; for PASS/FAIL/DOUBTS, optional explanation. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/SpelEvaluator.java` | No change — never reached for NOT_APPLICABLE rules. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/AgentRuleExecutor.java` | Same — never reached for NOT_APPLICABLE rules. |
| `lc-checker-v2-svc/src/main/resources/db/views.sql` (or wherever `v_check_results` lives) | Add `reason` column projection. |

### Verdict flow

```
For each rule R in catalog:
  if any d in R.required_docs not in session.presentedDocs:
    emit CheckResult(NOT_APPLICABLE, reason="input doc <d> not presented (see DOCSET-01)")
    continue
  if any field f in R.lc_pre_conditions empty in LcParseResult:
    emit CheckResult(NOT_APPLICABLE, reason="LC field <f> not populated")
    continue
  switch R.check_type:
    case PROG       → SpelEvaluator
    case AGENT      → AgentRuleExecutor.singleCall
    case AGENT_TOOL → AgentRuleExecutor.withTools
    case AGENTIC    → not reachable in static catalog (only COND-DYN)
```

### Acceptance criteria

1. Run `test/cases/01/` minus the BOL file — DOCSET-01 emits FAIL,
   TRANS-01..04 + DOCSET-02 + DATE-02 + DATE-03 emit NOT_APPLICABLE
   with the documented reason.
2. Run an LC missing `:44C:` — DATE-03 emits NOT_APPLICABLE with reason
   `"LC field :44C: not populated"`.
3. UI's `v_check_results` exposes `reason`; existing UI code renders
   without crash (graceful unknown-field handling).
4. `./gradlew compileJava` clean.

### Deferred

- UI styling of NOT_APPLICABLE chip (officer-facing — separate UI task).
- Statistics surfaces (% of rules N/A per session) — Phase 3.

---

## 7. W6 — COND-DYN AGENTIC :47A: decomposer

**Goal.** Implement the pipeline component from `rule-set.md` §3.
Runs at the start of Examine (a new pre-stage), reads `:47A:`, emits N
DynamicCondition rows, persists to `dynamic_rules`, dispatches each
non-`OUT_OF_SCOPE` condition as an inline AGENT/AGENT_TOOL check.

### Files to touch

| File | Change |
|---|---|
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/ConditionDecomposer.java` | New AGENTIC class. Reads `:47A:` prose, calls LLM in iteration loop (cap 6), emits `List<DynamicCondition>`. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/domain/rule/DynamicCondition.java` | New record matching the schema in `rule-set.md` §3. |
| `lc-checker-v2-svc/src/main/resources/prompts/check/COND-DYN.st` | New prompt template for the decomposer. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/stage/examine/ExamineStage.java` | Run `ConditionDecomposer` first when LC `:47A:` populated; loop the resulting conditions through `AgentRuleExecutor` like static AGENT rules. |
| `lc-checker-v2-svc/src/main/java/com/lc/v2/checker/infra/persistence/SessionStore.java` | Already has `dynamic_rules` table per CLAUDE.md. Add `persistDynamicCondition` and `loadCachedConditions` (sha256-keyed). |

### Cache behaviour

`dynamic_rules` is sha256-keyed on the `:47A:` text. Same LC re-run →
same dynamic conditions, no re-decomposition cost. Cache is per-LC,
not per-session.

### Acceptance criteria

1. Run an LC with a non-trivial `:47A:` (e.g. "Invoice must show
   contract number XYZ-123 and bear original company seal") — decomposer
   emits ≥1 `DynamicCondition` with `applies_to_docs:[INV]`,
   `check_kind: ASSERT_PRESENT`, `source_text` containing the verbatim
   clause.
2. Each non-`OUT_OF_SCOPE` condition produces a `CheckResult` row in
   `pipeline_steps` with stage=examine, step_key=`dyn:<condition_id>`.
3. Re-running the same LC reuses the cached `DynamicCondition` rows
   (verify by examining `dynamic_rules` row count + sha key).
4. An LC with empty `:47A:` skips the decomposer entirely (no LLM cost).
5. The decomposer respects the iteration cap (cap=6 default; configurable).
6. `./gradlew compileJava` clean.

### Deferred

- Severity calibration via real refusal data — model-suggested severities
  are officer-reviewable from day one.
- UI for officer to edit a generated DynamicCondition before it executes
  — Phase 3.
- Multi-language `:47A:` decomposition — monolingual constraint per `production-readiness.md` §11.

---

## 8. W7 — Verification corpus mapping

**Goal.** For the 4 existing test bundles, document per-rule expected
verdicts. This becomes the manual-walkthrough SoT and the regression
checkpoint for any future rule-set or extraction change.

### Files to create

| File | Content |
|---|---|
| `docs/architecture/verification-corpus.md` | One section per test bundle (`test/cases/01..04`). Each section: list of presented docs, the LC (pass/fail variant), and a table of `rule_id → expected verdict + reason`. |

### Methodology

1. For each bundle and each variant (mt700-pass / mt700-fail), enumerate
   which rules trigger (per `rule-set.md` §1 a-glance table) and what
   verdict each should produce.
2. Cross-check with the bundle's actual content (e.g., does the BOL
   have on-board notation? clean? full set?).
3. Record any expected NOT_APPLICABLE rules with their reason.
4. Note any rules whose expected verdict is "officer judgement" (DOUBTS)
   so manual walkthrough has a calibration target.

### Acceptance criteria

1. Each of 4 bundles × 2 LC variants = 8 verification scenarios documented.
2. Each scenario lists per-rule expected verdict for all 18 static rules.
3. Each scenario notes expected COND-DYN behavior (any `:47A:` clauses
   that should yield DynamicConditions, with expected check kinds).
4. Mismatches between expected and actual become bug tickets, not
   rule-set rewrites — the corpus is authoritative.

### Deferred

- Adding new test bundles to broaden coverage.
- Automated comparison of expected vs actual (requires test harness
  beyond v2's compile-sanity convention).

---

## 9. Out of scope (intentional)

- **Rule lifecycle UI** for the new rules (DRAFT / SUBMITTED / APPROVED
  / RELEASED states surfaced in admin governance UI). The rule set ships
  as RELEASED for v2 demo; lifecycle is a v3 concern.
- **Eval framework / harness** beyond compile-sanity. Project convention.
- **Rule-coverage live matrix** (143-reference → v2 mapping). One-shot
  appendix to `rule-set.md` if needed; not a continuously-maintained doc.
- **LC self-validation** (UCP 6/30/38 etc.) — out of scope per `rule-set.md` §6.
- **Insurance / COO / non-marine transport / multi-language** —
  v3 territory.
- **Bank-specific tuning** of severity / thresholds — post-launch.
- **RAG on examine path** — settled in `production-readiness.md` §2.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| W2 prompt changes regress vision quality on edge bundles | Run before/after on `test/cases/02..04` for each prompt; rollback per-prompt if regression detected. |
| W3 token-resolution introduces silent template breakage | Fail-fast on unknown ref id (no fallback); add startup validation that every rule's cited refs exist in corpus YAML. |
| W4 catalog rewrite breaks existing UI assumptions | UI uses `v_check_results` view; columns added are nullable, columns removed (`ucp_excerpt`) were never read by UI. Verify by smoke-test on session list / rule drawer. |
| W5 NOT_APPLICABLE cascade overwhelms officers in partial-presentation cases | Officer UI groups NOT_APPLICABLE into a single collapsed section per cause ("BOL absent → 8 rules"). Implementation note for UI workstream, not blocking. |
| W6 :47A: decomposer hallucinates conditions not in source | The `source_text` field carries verbatim quote; decomposer prompt forbids inventing. Officer can reject any DynamicCondition; reasons recorded. |
| Phase 2 lands but extraction quality is the actual bottleneck | W7 verification corpus + raw_quote provenance from W1 surface this immediately. Extraction iteration becomes a separate Phase 3 workstream. |

---

## 11. Sequencing recommendation

A two-week shape, single engineer:

| Day | Workstream | Deliverable |
|---|---|---|
| 1–2 | W1 | FieldEnvelope + OffSchemaItem + BBox lands; one consensus run shows raw_quote populated |
| 3–4 | W2 (parallel) | All 6 prompts updated; one e2e session run shows raw_quote on every field + non-empty OSI |
| 3–4 | W3 (parallel) | catalog.yml has zero ucp_excerpt; one rule run logs the resolved prompt with UCP/ISBP text injected |
| 5–7 | W4 | catalog.yml is the 18 rules; 10 .st files + 7 SpEL helpers; ./gradlew clean |
| 5–7 | W5 (parallel) | NOT_APPLICABLE cascade observable on missing-doc test |
| 8–9 | W6 | COND-DYN runs on a `:47A:`-rich LC; conditions in `dynamic_rules`; cache hit on re-run |
| 10 | W7 | verification-corpus.md complete; manual walkthrough on 4 bundles passes per the spec |

This is suggestive — actual sequencing depends on engineer capacity
and any blockers surfaced during W1/W2.

---

## 12. What lands at end of Phase 2

A v2 system that:

- Extracts with provenance (raw_quote on every field; open-world OSI)
- Has 18 well-named, well-cited, non-overlapping rules
- Cites UCP/ISBP from a single source of truth
- Reports NOT_APPLICABLE with reason instead of silent skip
- Decomposes `:47A:` free-text into actionable per-condition checks
- Has a documented verification corpus to regression-test against

This is the "production-ready for the 6 doc types" target from
`production-readiness.md` §3. UI surfacing of readiness gates remains
Phase 3 territory but the *underlying coverage* is in place.
