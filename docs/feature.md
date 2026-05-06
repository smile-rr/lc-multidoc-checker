# v2 — Business Feature Summary (Interview Reference)

LC compliance workbench. Replaces the manual document-checking step in a trade-finance
back office: an officer drops in an MT700 LC plus the supporting commercial documents,
the system extracts and cross-checks them against UCP 600 / ISBP 821, and the officer
signs off with a defensible audit trail.

## Who it serves

| Persona | What v2 lets them do |
|---|---|
| LC examiner / checker | Drop a presentation and get a pre-checked discrepancy list in minutes instead of hours |
| Senior officer | Override AI verdicts, disposition discrepancies, sign off with audit trail |
| Operations manager | Run the same checker against historical files for parallel-run validation (Phase 1 of rollout) |
| Auditor | Trace every officer decision back to the underlying document, rule citation, and tool call |

---

## 1. Multi-document presentation workbench

Single screen handles **6 document types** in one presentation: MT700 LC, Commercial Invoice
(INV), Bill of Lading (BOL), Packing List (PKL), Bill of Exchange (BOE), Beneficiary
Certificate (BC), Warranty Certificate (WC).

- Officer drops the entire presentation (LC text + N PDFs) in one go
- Filename-based doc-type detection (no LLM needed for this) — `bill-of-lading`, `packing-list`,
  `invoice`, etc.
- Unrecognised files surface as `UNKNOWN` and the officer picks the correct type from a menu
  before the pipeline can advance
- :46A: of the LC drives a **required-document checklist** so the officer sees at a glance
  whether the presentation is short any required doc

**Why this matters in interview**: trade-finance presentations are heterogeneous (different
banks, different exporters, different goods) — a v1-style "MT700 + Invoice only" tool
forces the officer back to manual mode the moment a B/L appears. v2 is presentation-shaped,
not document-shaped.

## 2. Officer-paced 5-stage pipeline

| Stage | Business purpose |
|---|---|
| **Intake** | Officer confirms the doc-type tile for each uploaded file; required-doc checklist populates from :46A: |
| **Parse** | Vision LLMs extract the canonical fields from every PDF in parallel; officer reviews per doc and marks reviewed |
| **Reconcile** | Field-by-field cross-document comparison (LC vs INV vs BOL vs PKL …) with MATCH / DISCREPANCY / TOLERANCE / NA verdicts; officer triages each cell |
| **Examine** | 20 UCP 600 / ISBP 821 rules run against the reconciled data; officer can override any verdict with a documented reason |
| **Sign-off** | Officer dispositions each FAIL (waive / cured / hold / refuse) and signs the record into an immutable audit table |

**Hard gate between every stage** — the backend pauses, marks `awaiting_officer=true`, and
waits. Officer triggers the next stage explicitly via a Continue button (or a per-stage
"⚡ run all" shortcut in DEV MODE). Going back to a prior stage automatically dirties
downstream work and re-runs from the changed stage on next forward.

**Why this matters in interview**: regulators and audit functions need to see *that a human
chose* — auto-advance through to a final verdict makes the system look black-box and
removes the officer's signature from each step. Hard gates make every stage an explicit
human checkpoint.

## 3. Vision extraction with consensus

Up to **4 parallel vision-LLM slots** extract the same PDF independently (e.g. local Ollama
qwen3-vl + 3 cloud Bailian models). Per-field consensus = majority vote across slots; tie
breaks toward slot 1.

- Confidence chip per field: HIGH (all agree) / MED (majority) / LOW (disagreement)
- Officer can drill into per-slot raw output via the "compare 3✓" affordance — see exactly
  which slot read what
- Officer correction modal: pick "Model got it wrong" → save the right value → persists
  through to Reconcile and Examine

**Why this matters**: vision LLMs hallucinate, especially on stamped/handwritten zones.
Consensus turns one model's confident wrong answer into a visibly *low confidence*
result that demands officer attention — the system surfaces uncertainty rather than
hiding it.

## 4. Reconciliation matrix (cross-document field comparison)

Pivots every canonical field across every presented document into a matrix. Each cell:

- **MATCH** — values agree (with whitespace / case / currency-symbol normalisation already applied)
- **DISCREPANCY** — values genuinely differ
- **TOLERANCE** — within ±10% (UCP 30(b) amount allowance)
- **NA** — field doesn't apply to this doc

Officer triages each non-MATCH cell as `parse_error`, `genuine`, `accept_match` (with note),
or `edited` (override the value). **Lock gate** prevents advancing to Examine until every
non-MATCH non-NA cell has a decision recorded.

**Why this matters**: Reconcile is mechanical and **does NOT use an LLM** — it is the
deterministic spine of the workbench. Discrepancies that *need* UCP/ISBP citation
("corresponds to" — ISBP C3, "non-contradictory" — UCP 14(d)) live in Examine instead.
This split keeps Reconcile reproducible and Examine explainable.

## 5. UCP 600 / ISBP 821 rule engine (4 tiers)

20 active rules covering currency, amount, date, party, goods, shipment, document, and
condition checks. Four execution tiers based on the nature of the check:

| Tier | Mechanism | API calls | Use case |
|---|---|---|---|
| **Programmatic** | SpEL expression on field maps | 0 | Currency match, draft = invoice amount |
| **Agent** | Single LLM call, structured JSON | 1 | Goods-description correspondence (ISBP C3) |
| **Agent + Tools** | LLM call + compute tool (math/date) | ≤3 | Invoice arithmetic, presentation-window calc |
| **Agentic** | ReAct reasoning loop, ≤6 calls | ≤6 | :46A: condition compliance (multi-doc lookup) |

Every rule cites the exact UCP/ISBP article in its verdict explanation. Adding a 21st rule
= edit YAML; no Java change required.

**Why this matters in interview**: not every rule needs reasoning. Currency match is
deterministic — putting it through an LLM is wasteful and adds variance. Tiered dispatch
keeps cost predictable: ~half the rules are 0 LLM calls, the expensive `Agentic` tier
is reserved for genuinely multi-step reasoning.

## 6. Dynamic rules (per-LC, generated at runtime)

When a specific LC has unusual conditions in :47A: that don't map to a static rule, the
system generates a per-LC rule from the LC text and caches it (sha256-keyed). Ensures
that bespoke conditions ("certificate must be issued by the Chamber of Commerce of …")
get explicit verdicts instead of hiding inside a generic AGENT rule.

## 7. Officer authority — override and disposition

The system never has the final word. Every AI verdict is an *opinion* the officer can:

- **Override** at the Examine stage — flips PASS↔FAIL with a reason note; chips show
  OVERRIDDEN / FLAGGED on the worklist row
- **Disposition** at Sign-off:
  - **WAIVER** — discrepancy waived under UCP 16(b) (waivable rules only)
  - **CURED** — beneficiary fixed and re-presented
  - **HOLD** — pending applicant approval
  - **REFUSE** — issue an MT734 advice of refusal (system auto-fills the SWIFT block)

Append-only `officer_actions` table records every decision with timestamp + officer ID.
"Current state" of any cell/rule = latest row per `(session, action, target)`.

**Why this matters**: the system is a decision-support tool, not a decision-making tool.
Audit reconstruction is just "show every officer action for this presentation".

## 8. MT734 (Advice of Refusal) auto-generation

On REFUSE disposition the system pre-fills the SWIFT MT734 from the session:
discrepancy list (rule IDs + UCP citations + officer notes), drawer/payee, document
status, disposal of documents. Officer reviews the rendered SWIFT block and signs.

**Why this matters**: MT734 is the most error-sensitive output — a wrong field can void
the refusal and force the bank to honour a non-compliant presentation. Pre-filling from
the system of record eliminates manual transcription error.

## 9. Sign-off and frozen audit record

Once signed:
- Pipeline state, officer actions, and final disposition are sealed (`compliant` flag,
  `signoff` row in the same `pipeline_steps` table that holds system computations)
- "Signed Record" view replaces the editable workbench — visible to all officers, no
  further edits possible
- JSON export available for downstream (banking core / archive / regulator)

## 10. Operator productivity features

| Feature | Demo / production value |
|---|---|
| **Quick-start presets** | One-click load of test bundles (3 cases × pass/fail variants) — drops 1 LC + 6 PDFs into the upload zone |
| **DEV MODE** | Bypass officer gates; per-stage "Confirm all suggested" / "Mark all reviewed" / "Skip lock gate" / "Auto-disposition all"  |
| **Cancel mid-stage** | Cooperative soft cancel — current stage finishes, then loop exits, status pill turns CANCELLED |
| **Re-run from any stage** | `⚡ Re-run from <stage>` button wipes downstream rows and replays — useful when officer corrected a parsed field |
| **Progressive disclosure** | Live ActivityStrip in Parse/Examine — current sub-step (`rendering_pdf` → `calling_<model>` → `parsing_response`), per-rule progress (`7/20 · INV-006 (AGENT)`) |
| **Multi-tab sync** | SSE-driven; same session in two tabs stays in lockstep — officer A locks → officer B's Continue button enables |
| **Re-presentation flow** | Officer corrections at any stage automatically dirty downstream work; next forward triggers re-run from the changed stage |

## 11. Observability and traceability

- **Langfuse traces** for every LLM call (prompt, completion, tokens, latency, cost) under
  the session ID — discrepancy explanations are reproducible from the trace
- **OpenTelemetry spans** via `@PipelineStage` AOP — stage code stays clean of tracer wiring
- **Audit views**: `v_signoff`, `v_check_results`, `v_cell_decisions`, `v_rule_overrides`,
  `v_field_corrections` — every officer decision queryable as flat rows

## 12. Roadmap framing (what's deliberately NOT in v2)

| Out of scope (intentional) | Reason |
|---|---|
| Auto-advance pipeline | Officer authority is the product — gate is a feature not a bug |
| RAG against UCP 600 / ISBP 821 | Articles are short and stable; we ship them as YAML refs cited by rule, not as a vector store |
| ChromaDB / vector search | Same reason — would add deployment surface for ~150 short paragraphs |
| Type C document detection | The 6 supported types cover ~85% of presentations the demo officer handles; long tail is roadmap |
| Mobile UI | Officers work on desktop; no business case for mobile in MVP |

---

## Talking-track for interviews — three angles

### 1. The product story (positioning)
"Trade finance hasn't been disrupted by AI the way trading or retail banking has —
because the unit of work is *a presentation*, not a transaction or a customer. v2 takes
the presentation as the primitive: drop the LC + PDFs, get a worked discrepancy list with
UCP citations, sign off in minutes. The bank keeps the officer's signature on every step;
the AI just removes the manual extraction and cross-reference work."

### 2. The architecture story (trust)
"The interesting design tension in compliance AI is *not* model accuracy — it's
auditability. Three things make v2 defensible: (a) tiered rule execution, so half the
verdicts are deterministic SpEL not LLMs; (b) Reconcile is LLM-free, so the data layer
of the audit is reproducible; (c) every officer decision is an append-only row with a
timestamp, so 'current state' is always derivable. Hard gates between stages make every
human approval an explicit, traced action."

### 3. The cost story (production economics)
"Per-presentation LLM cost is bounded by tier dispatch: programmatic rules are free,
single-call AGENT rules are ~1¢, tool-using rules cap at 3 calls, agentic rules cap at 6.
A typical presentation runs ~20 rules + 6 vision extractions; total inference cost
is well under $0.50 per presentation, and ~80% of that is vision extraction. The vision
side uses parallel slots with a free local Ollama as primary, so cloud spend is a
fallback only."

---

## Reference artefacts in this repo

| What | Where |
|---|---|
| Full project spec (tech) | `CLAUDE.md` |
| Rule definitions (20 active) | `lc-checker-v2-svc/src/main/resources/rules/catalog.yml` |
| Rule reference catalog (143 rules total) | `docs/reference/rule-catalog.md` |
| Document taxonomy & 12 AI pitfalls | `docs/reference/doc-taxonomy.md` |
| Test bundles (4 cases × pass/fail) | `test/cases/01–04/` |
| Live demo walk-through | `CLAUDE.md` § Verification Checklist |
