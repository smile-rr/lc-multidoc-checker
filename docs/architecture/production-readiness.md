# Production Readiness for v2 — Extraction & LC Check

**Status:** Draft for review. No code changes until this is agreed.
**Date:** 2026-05-07
**Scope:** What it takes for `v2-multiple-doctype` to handle real-world LC
presentations across the 6 supported doc types (INV, BOL, PKL, BOE, BC, WC) —
not as a feature demo, but as something a bank's compliance officer can rely on.

This document is **Phase 1** of a two-phase plan. Phase 2 is the spike plan
that follows from this one; it is not in this file. Phase 2 begins only after
this document is agreed.

---

## 1. Pipeline shape stays. Four things change.

The 5-stage auto-advancing pipeline (Intake → Parse → Reconcile → Examine →
Signoff), the field-pool / canonical-field design, the SSE event bus, and the
`@PipelineStage` AOP tracing are all sound. They are not what's broken.

What's broken is, in order of leverage:

1. **Extraction prompts surface schema, not evidence.** `off_schema_items`
   captures `page` + `confidence` but no verbatim text. Officers and rules
   can't quote the document.
2. **`COND-03` (:47A: decomposition) is disabled.** This is the single biggest
   real-case gap. Most refusals trace to :47A: clauses no rule covers.
3. **Citations are dual-injected.** Both `catalog.yml` (via `ucp_excerpt`) and
   the per-rule `.st` files carry UCP/ISBP text. No dynamic resolution from
   `ucp600.yaml` / `isbp821.yaml`. Two files drift, and the corpus YAMLs are
   not the source of truth for what the LLM sees.
4. **43% of the catalog is disabled.** 10 of 23 rules off; several because
   extraction doesn't emit what they need. The disable list is a signal-
   leakage map, not a rule-design problem.

These are the four work-streams of the rest of this document.

---

## 2. RAG vs rule-bound citation injection — settled

We will **not** use RAG on the examine path. Reasons:

| Factor | Why it argues against RAG |
|---|---|
| Corpus size | UCP 600 = 39 articles; ISBP 821 ≈ 200 paragraphs. Trivially fits in context. |
| Determinism | Banks must reproduce the same verdict on the same docs. RAG retrieval is non-deterministic across embedding model versions. |
| Auditability | Refusals are challenged. "The model retrieved §X" is not defensible; "rule INV-006 cites ISBP-C3 ¶17" is. |
| One rule = one authority | The rule↔article mapping is known at design time. There is nothing to retrieve. |
| Industry pattern | Surecomp DOKA-NG, Conpend, Coriolis, IBM Watson Trade, the major Chinese in-house systems all use rule-catalog architectures with citations baked in. |

**The pattern we use is rule-bound citation injection:** every rule names its
UCP/ISBP refs by id; the prompt template resolves `{{ref.X.text}}` from
`ucp600.yaml` / `isbp821.yaml` at execution time. Same approach already
present in `prompts/check/DOCSET-01.tokenized.st` — generalize it.

RAG has one legitimate place in this product: **open-ended officer Q&A** on
UCP/ISBP (governance/onboarding tools). Not the examine pipeline. Out of
scope for this document.

---

## 3. Production-readiness criteria

A doc type is production-ready when **all of**:

1. Its extraction prompt emits a `raw_quote` for every field that is or could
   be cited in a discrepancy, plus an open-world `off_schema_items` list with
   `raw_quote`, `page`, `bbox` (when available), and `confidence`.
2. Every rule that targets that doc type is either **enabled** or **explicitly
   deprecated** with a recorded reason. No silent disables.
3. Every active rule cites at least one UCP article or ISBP paragraph by id;
   no rule carries inline citation text that is not also resolvable from the
   corpus YAML.
4. Every AGENT rule's prompt resolves `{{ref.X.text}}` at runtime — corpus
   YAML is the single source of truth for what the LLM sees.
5. The doc type has a recorded **rule-coverage map** against the 143-rule
   reference catalog: each reference rule is mapped to a v2 rule_id, marked
   "deferred" with a reason, or marked "out-of-scope" with justification.
6. :47A: conditions that target the doc type are decomposed and dispatched
   to it (see §6).

There is no "production-ready overall." There is only per-doc-type readiness.
The signoff stage exposes the per-doc-type readiness flags so officers know
what they're trusting.

---

## 4. Extraction redesign — provenance-first, open-world

### 4.1 The core change: every extracted value carries a `raw_quote`

Today the extract prompts return `{ value, page, confidence }`. The
`raw_quote` field is the smallest change with the largest impact.

Schema for a field hit:
```json
{
  "value": "USD 124,500.00",
  "raw_quote": "Total Amount: USD 124,500.00",
  "page": 1,
  "bbox": [120, 480, 410, 504],
  "confidence": 0.94
}
```

The `bbox` is best-effort — many providers don't return one. The `raw_quote`
is mandatory: it's the audit trail. A rule's failure explanation must be
able to say *"the invoice page 1 reads 'Total Amount: USD 124,500.00' but
the LC :32B: reads 'USD 125,000.00'"* — that requires both quotes available
at examine time.

This is a one-paragraph addition to each extract prompt and a small schema
extension on `FieldEnvelope`. Nothing more.

### 4.2 `off_schema_items` becomes the open-world capture

Today `off_schema_items` is a hint mechanism the audit found is
*captured but unused*. Make it the open-world side-output:

```json
{
  "raw_quote": "FREIGHT PREPAID AT LOAD PORT",
  "page": 1,
  "bbox": [220, 180, 480, 196],
  "confidence": 0.91,
  "tags": ["freight_terms", "incoterm_signal"]
}
```

The `tags` are the model's best guess at what category the snippet belongs
to. AGENT rules on the doc type get the full `off_schema_items` list as
context, with instruction to consider relevant items. PROGRAMMATIC rules
ignore it. This is the path by which a hand-stamped clause on page 3
becomes legible to the pipeline without us having to enumerate it as a
field upfront.

### 4.3 Per-doc-type prompt domain coaching

The audit found INV/BOE/PKL prompts have **zero** domain coaching, while
BOL/BC/WC have excellent UCP/ISBP-flavored guidance. Bring INV/BOE/PKL up
to the BOL bar:

| Prompt | Coaching to add |
|---|---|
| `inv-extract-vision.st` | Port-of-loading / port-of-discharge fields when present (XD-024 needs them); Incoterm normalization; trade-term + price clause distinction; explicit `applicant`/`beneficiary` party roles, not just labels |
| `boe-extract-vision.st` | Tenor parsing: distinguish "X DAYS AFTER B/L DATE" vs "X DAYS AFTER SIGHT" vs "DUE date"; drawn-on party identity discipline; tenor-start-date reference (for downstream maturity calc) |
| `pkl-extract-vision.st` | Per-carton breakdown structure (PKL-003 needs it); shipping-marks block (PKL-004 needs it); consolidation/master-pack distinction |

Concrete editing pass; not a rewrite.

### 4.4 What stays the same

- The 4-slot vision consensus pattern (`VISION_N_*`)
- The `enable_thinking: false` + `response_format: json_object` for Qwen
- The `consensus(model_1, ..., model_N)` source labelling
- `DocumentExtract` shape, `FieldEnvelope` API surface

This is an evolution of the extract layer, not a rebuild.

---

## 5. Rule coverage — the 4 check types, clarified

`catalog.yml` already has the right four types; the issue is they're used
inconsistently and the boundary between AGENT_TOOL and AGENTIC is fuzzy.
Crisp definitions for v2:

| Check type | When to use | Example |
|---|---|---|
| `PROGRAMMATIC` | Comparison decidable from FieldEnvelope alone, with no semantic judgement. | INV-003 currency match, GEN-003 doc-date ≤ presentation-date. |
| `AGENT` | Single LLM call against the rule's prompt template. Needed when the comparison is semantic (description equivalence, clean-or-not, signature-or-not). | INV-006 goods description vs :45A:; BOL-009 clean B/L. |
| `AGENT_TOOL` | LLM with one well-defined tool round (lookup or compute). Use when the rule needs a deterministic computation the LLM should not do (date math, FX, tolerance check). | DATE-02 21-day window with date-arithmetic tool. |
| `AGENTIC` | Multi-iteration tool-using loop with a hard cap. Use only when the rule must navigate evidence that's not knowable in advance (search inside long :47A: prose; cross-doc consistency where the relevant fields aren't predictable). | COND-03 :47A: decomposition; XD-022 cross-doc beneficiary identity. |

### 5.1 What's missing — a 5th category for LC self-validation

The audit found zero rules that check the LC against UCP/ISBP. Examples
that real banks check:

- **UCP 6(c)** — "A credit must not be issued available by a draft drawn
  on the applicant." (Common silent violation.)
- **UCP 38** — transferable/non-transferable consistency.
- **UCP 30(a)** — "about" / "approximately" interpretation.
- **ISBP A22** — language consistency between LC and required docs.

These don't fit `triggerDocs:[…doc types…]` because they trigger on the LC
itself. Introduce a `triggerOn: LC_SELF` value alongside the existing
doc-type triggers; LC-self-validation rules execute in Examine before any
doc-targeting rules. They run once per session against the parsed LC.

This is **not** a structural change — it's one new value of an existing
field. But it adds a real, currently-missing check class.

### 5.2 The 4-type ↔ 3-type taxonomy gap

Reference catalog uses `A` (deterministic) / `B` (LLM semantic) / `C`
(human review). Implementation uses 4 types. The reference's `B` covers
both AGENT and AGENT_TOOL and AGENTIC. The `C` (human review) maps to v2
PROGRAMMATIC_AGENT today by accident (and is treated as AGENT in POC code).

Decision: keep the 4 implementation types; teach the reference catalog's
B-rules to choose between AGENT / AGENT_TOOL / AGENTIC at v2-rule-authoring
time, with criteria documented in `catalog.yml` header comment. C-rules
that genuinely need human review become a sign-off-stage flag, not a
catalog entry.

---

## 6. :47A: decomposition — first-class pipeline citizen

`COND-03`'s disable note is wrong. The disable reason given is
*"degenerates to 'all docs are in English'; not meaningful"* — that's a
prompt-design failure, not a rule-design failure. The rule's *intent*
(decompose :47A: into atomic conditions, dispatch each to target docs)
is exactly the missing pipeline capability.

Promote :47A: handling out of "one rule that's currently off" into a
**dynamic rule generator** that runs in Examine pre-pass:

```
Examine begins
  → :47A: decomposer (LLM, AGENT_TOOL):
       input  : LC :47A: prose, list of presented doc types, UCP/ISBP corpus refs
       output : List<DynamicCondition>{
                  id, source_text (raw_quote),
                  applies_to_docs[], polarity, severity,
                  ucp_refs[], isbp_refs[],
                  check_kind: ASSERT_PRESENT | ASSERT_EQUALS | ASSERT_FORMAT
                              | ASSERT_ABSENT | OUT_OF_SCOPE
                }
       gate   : OUT_OF_SCOPE conditions are filtered with reason recorded
                in officer_actions for transparency
  → For each remaining DynamicCondition:
       persist as `dynamic_rules` row (table already exists)
       execute as inline AGENT or AGENT_TOOL rule against target docs
  → static catalog rules run as today
```

The `dynamic_rules` table in `lc_v2` schema already exists; this is what
it was designed for. The decomposer is the gate that decides which :47A:
clauses become rules vs which are recorded as informational and skipped.
Officers see both lists.

Why this works where COND-03 didn't:
- **Provenance:** every dynamic condition carries `source_text` (raw quote
  from :47A:). Officers can see what the system thinks the condition is,
  and reject if mis-parsed.
- **Scoping:** `applies_to_docs[]` prevents the "applies to all docs in
  English" degeneracy.
- **Bounded check kinds:** the 5 kinds keep the LLM honest and let us
  template the per-condition prompt.
- **Cache key:** `dynamic_rules` is sha256-keyed on LC text — same LC
  yields same dynamic rules across re-runs.

This is the highest-leverage single change in the document. Most real
refusals trace to :47A:.

---

## 7. Citation single-source-of-truth

Today: `catalog.yml` carries `ucp_excerpt: "…"` inline; `prompts/check/<RULE_ID>.st`
carries a CITATIONS block; `refs/ucp600.yaml` and `refs/isbp821.yaml` exist
but are only referenced by id. Three places, two of which drift.

Target: rules name citations by id only; the corpus YAMLs are the only
place that hold text; prompt templates resolve `{{ref.UCP-14-c.text}}`
and `{{ref.UCP-14-c.heading}}` at execution time. `RuleCatalogRegistry`
+ `ArticleRefRegistry` already exist; this is wiring, not new infra.

Net effect:
- One file to update when an article is amended.
- `catalog.yml` becomes ~30% smaller (no inline excerpts).
- Prompt files become more legible and version-stable.

---

## 8. Rule coverage matrix — current vs target

Reference catalog: 143 rules. v2 active: 20. ~14% coverage.

The audit's recommended *85% coverage of real LC presentations* is a
bandwidth target, not a rule-count target. We hit it not by enabling all
143 but by enabling **the rules that account for the 80th-percentile of
real refusals**. Industry data (ICC DOCDEX, banking advisory commissions)
suggests the discrepancy long-tail is heavily concentrated:

| Refusal cause | Approximate share of real refusals |
|---|---|
| Late presentation / past expiry | ~12% — covered by DATE-02 |
| Description discrepancy | ~14% — covered by INV-006 |
| Inconsistencies between docs | ~17% — partially covered (XD-022, XD-024) |
| Missing or wrong-form documents | ~10% — covered by DOCSET-01 |
| Late shipment | ~8% — partially (DATE-02 window) |
| Insurance defects | ~6% — **0% coverage** (INS not in v2's 6 doc types) |
| Bill-of-lading defects (clean, on-board, full set, ports) | ~12% — covered by BOL-003/005/007/009 |
| :47A: custom-condition defects | ~10% — **0% coverage** (COND-03 disabled) |
| Goods quantity / packing-list inconsistency | ~5% — disabled (GOODS-02/03) |
| Other | ~6% |

Two priorities fall out of this:
1. **Re-enable :47A: handling** (~10% of refusals, currently 0% coverage).
2. **Re-enable extraction-blocked rules** (GOODS-02/03 + PARTY-01/03);
   contingent on §4 prompt changes landing first.

A full mapping of 143-reference → v2 coverage state lives in a separate
matrix file (Phase 2 deliverable, `docs/architecture/rule-coverage.md`),
maintained per doc type and updated on every rule lifecycle event.

---

## 9. Disabled-rule audit (10 rules)

Current disabled list with proposed disposition:

| Rule | Why disabled today | Disposition |
|---|---|---|
| `GOODS-02` (qty consistency) | Extraction doesn't surface PKL per-carton totals | **Re-enable after §4.3 PKL prompt fix** |
| `GOODS-03` (marks consistency) | Same — extraction doesn't surface shipping marks | **Re-enable after §4.3** |
| `PARTY-01` (issuer identity) | Gate-trace false positives | **Re-enable** with revised gate that requires `:50:` parsed as separate from address block |
| `PARTY-03` (drawee identity) | Same as PARTY-01 | **Re-enable** with same fix |
| `DOC-03` (specific-doc presentation) | Overly strict matcher | **Re-enable** with normalized name matching (lowercase + punctuation strip) |
| `DATE-02` (21-day window) | Returns DOUBTS with empty explanation; tool-call reliability | **Re-enable** with structured tool output schema enforcement |
| `COND-02` (WC :47A:) | Note "COND-01 demonstrates pattern" | **Deprecate** — superseded by §6 dynamic-rule generator |
| `COND-03` (universal :47A:) | Note "degenerates to English check" | **Replace** — becomes the §6 decomposer + dispatch flow |
| (2 others to enumerate during Phase 2) | tbd | tbd |

The principle: a rule is either active or has a recorded disposition with a
target lifecycle event. No silent disables.

---

## 10. Production-readiness gates per doc type

Going-live checklist per doc type (officer-facing, surfaced in signoff):

```
INV  ✓ extract has raw_quote on all fields and off_schema_items
     ✓ active rules cover :32B amount, :32B currency, :45A goods, parties, ports
     ✓ XD rules with INV present (XD-022, XD-024) active and citing
     ✓ no inline ucp_excerpt; all citations resolve from corpus
     ✓ reference-catalog map: 22 rules → covered/deferred/oos

BOL  ✓ as INV, plus on-board notation, clean, full-set, ports, transhipment
PKL  ✓ as INV, plus per-carton + marks fields surfaced
BOE  ✓ as INV, plus tenor-start-date reference + drawee identity
BC   ✓ as INV, plus :47A: dispatch results listed
WC   ✓ as INV, plus :47A: dispatch results listed
LC   ✓ self-validation rules (UCP 6(c), UCP 38, etc.) running pre-doc-rules
```

These gates determine whether a doc type's verdict is *signed* (officer
accepts the system's verdict as authoritative) vs *advisory* (officer
must independently confirm). Banks will roll out doc-type-by-doc-type;
the gate flags make that explicit instead of all-or-nothing.

---

## 11. Non-goals (intentional, document-them)

- **No insurance, no certificate-of-origin** for now — out of v2's 6 doc
  types. Reference catalog covers them; v3 territory.
- **No translation** of foreign-language docs in this round. Document the
  monolingual constraint in officer-facing copy.
- **No RAG** on examine path (see §2). Open-ended officer Q&A tools are
  separate scope.
- **No re-architecture** of pipeline shape, SSE, AOP tracing, or
  FieldEnvelope. The bones are right; the muscle is what's missing.
- **No new check types** beyond clarifying the existing 4 + adding one
  trigger value `LC_SELF`.
- **No automated regression tests** beyond compile sanity (project
  convention preserved).

---

## 12. What "agreement on this document" means

If you agree with this document, Phase 2 produces a single concrete
spike plan with file-level edits and sequencing. The spike plan
focuses on the highest-leverage item first:

1. `raw_quote` provenance in extracts (smallest change, unblocks rules
   and audit trail).
2. :47A: decomposer + dispatch (largest leverage, ~10% refusal coverage
   gain).
3. Single-source citation resolution (`{{ref.X.text}}`).
4. INV/BOE/PKL prompt domain coaching (unblocks GOODS-02/03 + better
   downstream signal).
5. Re-enable the 6 fixable disabled rules (PARTY-01/03, DOC-03, DATE-02,
   GOODS-02/03), deprecate the 2 superseded ones (COND-02/03).
6. LC self-validation rules (UCP 6(c) etc.) as the first `LC_SELF`
   trigger users.

Each step has independently verifiable acceptance criteria; we don't
land all six before checking. The plan is explicitly *not* "rebuild
extraction" or "rewrite examine" — it's a sequence of small, auditable
changes against a pipeline that's structurally fine.

---

## 13. Decisions (resolved 2026-05-07)

1. **`LC_SELF` trigger — IN.** Add as 5th trigger value. UCP 6(c), UCP 38,
   ISBP A22, etc. become first-class checks running once per session
   against the parsed LC, before any doc-targeting rules.

2. **Open-world `off_schema_items` consumption — IN.** Vision extraction
   captures *every potentially LC-relevant snippet* (raw_quote + page +
   tags + confidence). AGENT rules consume them as additional context.
   This is non-negotiable: if a clause exists in the document and could
   bear on the LC check, it must reach the rule that decides on it.
   Predefined fields are an optimization, not the architecture.

3. **Per-doc readiness gates — POLICY IN, UI ON-HOLD.** This is a demo
   project; the officer-facing *signed vs advisory* surface is on hold
   if it complicates the demo. But the underlying readiness *policy*
   (what each doc type must satisfy to be production-ready) is captured
   in this document and tracked. UI surfaces ship later.

4. **Rule set design — CONSOLIDATED, NOT ENUMERATED.** This is the
   pivotal decision and replaces the "143-reference mapping" approach.
   See §14.

5. **Disabled rules — NONE.** No silent disables going forward. The 10
   currently-disabled rules are folded into the §14 consolidation:
   either re-expressed in a redesigned rule, deprecated with reason
   recorded, or merged into a sibling.

---

## 14. Rule set design — consolidated, not enumerated

The reference catalog has 143 rules. v2 has 20. Neither number is right.

**The wrong target:** "implement all 143." Most are tiny per-field
equality checks ("invoice quantity matches packing-list quantity",
"signature present") that would scatter the same logical concern
across many catalog entries. Hundreds of small rules become unreadable,
unmaintainable, and hide which check actually fired on a refusal.

**The wrong target:** "20 rules forever." The current 20 are
demo-driven, not coverage-driven. Real-case audit shows missing classes
(:47A: dispatch, LC self-validation, transport-doc fullness) and
overlapping ones (date checks fragmented across DATE-01/02/03).

**The right target:** **a small, coherent set — roughly 25–35 rules —
where each rule encodes one meaningful compliance concern, programmatic
and agent logic cooperate inside the rule when they need to, and
similar cases across docs are consolidated into one cross-doc rule
rather than duplicated per-doc.**

### 14.1 Rule design principles

1. **One rule = one compliance concern.** "Document dates valid
   relative to presentation date" is one rule across all 6 doc types,
   not 6 per-doc rules. "Goods description complies with :45A:" is one
   rule, not three (description + currency + amount).

2. **Programmatic and Agent cooperate within a rule.** A rule may have
   *both* a programmatic gate and an agent reasoning step. Pattern:
   programmatic does the deterministic part (extract dates, compute
   delta, compare numbers); agent does the semantic part (judge
   equivalence, interpret prose). Existing `PROGRAMMATIC_AGENT` /
   `AGENT_TOOL` types support this — use them deliberately. Programmatic
   alone is preferred when sufficient; agent alone is reserved for
   purely semantic checks.

3. **Cross-doc consolidated, not per-doc duplicated.** A rule that
   compares INV ↔ PKL ↔ BOL is *one* cross-doc rule (XD-class), not
   three pairwise rules. The rule's `triggerDocs` lists the set; the
   rule body handles the multi-way comparison.

4. **Human-readable rule name and rationale.** A non-technical
   compliance officer should understand what each rule does from its
   name + one-paragraph rationale. No SpEL leakage into the name.
   No rule whose meaning depends on understanding the implementation.

5. **No silent disable.** Either active, deprecated-with-reason, or
   superseded-by `<rule_id>`. Lifecycle is recorded; the catalog is
   honest about its own coverage.

6. **Each rule cites at least one UCP article or ISBP paragraph by
   id.** The rule's prompt resolves the cited text at execution time.
   No inline excerpt drift (per §7).

7. **Each rule has a defined evidence shape.** What fields/quotes
   from which docs it expects to consume. If extraction can't supply
   that evidence today, the *rule* records the gap; we don't disable
   it silently.

### 14.2 Proposed rule classes for v2's 6 doc types

The following is an architecture sketch — not the final rule list.
The actual list is the Phase-2-Workstream-0 deliverable
(`docs/architecture/rule-set.md`). Sketch:

| Class | Rules (approx) | Examples |
|---|---|---|
| **LC self-validation** (`triggerOn: LC_SELF`) | 4–6 | UCP 6(c) drafts on applicant; UCP 38 transferable consistency; ISBP A22 language; UCP 30(b) tolerance form |
| **Date conformance** (consolidated) | 2–3 | One rule: all docs dated ≤ presentation, ≥ LC issuance, with per-doc-type tolerances. One rule: 21-day window + LC expiry. One rule: latest shipment date. |
| **Amount & currency** (consolidated) | 2–3 | One rule: invoice amount/currency consistent with LC, within UCP 30(b) tolerance, arithmetically sound. One rule: BOE amount = invoice amount. |
| **Document set** (`DOCSET-*`) | 1–2 | One rule: every :46A: required doc is presented (with intent + form match). One rule for full-set originals (B/L). |
| **Goods description** | 1–2 | One rule: invoice goods *correspond to* :45A:, with ISBP C-class semantic equivalence. PKL/BOL goods need not "correspond to" — UCP 14(e). Encoded inside the rule, not split. |
| **Transport (BOL-class)** | 3–4 | On-board notation; clean B/L; ports of loading/discharge; freight prepaid/collect signal. |
| **Parties** (consolidated) | 2 | One rule: applicant/beneficiary identity consistent across all docs presenting either party. One rule: drawee/issuer of BOE = LC-stated drawee. |
| **Cross-document consistency** (XD) | 3–5 | INV↔PKL↔BOL quantity/marks/weight; BOE↔INV amount; beneficiary across all docs. |
| **Certificate content** (BC + WC) | 1–2 | One rule covering both BC and WC: certificate content satisfies the :47A: clause(s) it was required to satisfy. Signature/form check is a separate small rule if needed. |
| **:47A: dynamic conditions** | (generator, not static rules) | The §6 decomposer emits `dynamic_rules` rows per session. Not counted in the static rule total. |

Sketch total: **~22–32 static rules + dynamic :47A: rules per session.**

This is a target band, not a commitment. The Phase-2 rule-set
deliverable will land on a specific number with specific names and
rationales for review.

### 14.3 What this displaces

This consolidation *displaces* the "map all 143 reference rules"
approach. The reference catalog stays as a coverage check
(*"are there reference rules our consolidated set materially fails
to cover?"*) but is no longer the rule-set design driver.

It also displaces enumerating GOODS-02, GOODS-03, PARTY-01, etc. as
distinct rules. They get folded into the consolidated cross-doc /
parties rules. The consolidated rule's `evidence_shape` records what
extraction must supply; if extraction is gapped, the rule records a
DOUBTS verdict with the gap reason — never silent disable.

### 14.4 Demo-readiness vs production-readiness

This is a demo project, but the rule set is designed as if it were
production. That means:
- Coverage of the 80th-percentile real-refusal causes (per §8 table).
- Every rule readable by a non-engineer.
- Every rule citing UCP/ISBP.
- Every rule has at least one POSITIVE and one NEGATIVE eval scenario.
- The :47A: decomposer ships as a real component, not a hardcoded
  short-circuit.

The signoff-UI readiness gates (§3 / §10) ship later. The rule-set
itself ships now.
