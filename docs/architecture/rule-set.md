# v2 Consolidated Rule Set

**Status:** Phase 2 deliverable (1) — rule SoT for review.
**Date:** 2026-05-07
**Companion:** `production-readiness.md` §14 (design philosophy).
**Scope:** the 6 doc types — INV, BOL, PKL, BOE, BC, WC.
**Out of scope (explicit):**
- **LC self-validation** is the *issuing bank's* responsibility at LC
  issuance time (UCP 6, 30, 38 etc.). v2 sits at the *presentation*
  stage (UCP 14(a)) — its job is doc-vs-LC examination, not
  LC-vs-UCP. The LC was accepted when issued; we don't re-litigate it.
- Insurance docs (INS), Certificate of Origin (COO), Inspection
  certificates, AWB/CMR/RWB transport variants. v3 territory.

This document replaces the 20-active / 23-total / 10-disabled state in
`catalog.yml`. Total static rules below: **18**. Plus 1 :47A: dynamic
rule generator that emits N condition-rules per session at runtime.

---

## 1. Rule index — at a glance

| ID | Name | Required docs | Optional docs | LC pre-conditions | Type | Sev |
|---|---|---|---|---|---|---|
| `DATE-01` | Doc dates within valid window | any presented doc | — | — | PROG | MAJOR |
| `DATE-02` | Presentation within window and before LC expiry | `BOL` | — | — | AGENT_TOOL | CRITICAL |
| `DATE-03` | Latest shipment date observed | `BOL` | — | `:44C:` populated | PROG | CRITICAL |
| `AMT-01` | Invoice amount/currency conform to LC, within tolerance | `INV` | — | — | AGENT_TOOL | CRITICAL |
| `AMT-02` | BOE amount equals invoice amount and conforms to LC | `BOE`, `INV` | — | — | PROG | CRITICAL |
| `DOCSET-01` | Every required document is presented | — (LC-driven) | — | `:46A:` populated | AGENT | CRITICAL |
| `DOCSET-02` | Full set of originals presented (transport doc) | `BOL` | — | — | PROG | CRITICAL |
| `GOODS-01` | Invoice goods description corresponds to `:45A:` | `INV` | — | `:45A:` populated | AGENT | MAJOR |
| `TRANS-01` | B/L bears on-board notation and date | `BOL` | — | — | PROG | CRITICAL |
| `TRANS-02` | B/L is clean (no defect/damage clauses) | `BOL` | — | — | AGENT | MAJOR |
| `TRANS-03` | Ports of loading and discharge match LC | `BOL` | — | `:44E:` and/or `:44F:` populated | AGENT | CRITICAL |
| `TRANS-04` | Freight terms conform to LC and Incoterm | `BOL`, `INV` | — | — | AGENT | MAJOR |
| `PARTY-01` | Beneficiary/applicant identity consistent across docs | any presented doc carrying party identity | — | `:50:` and `:59:` populated | AGENT | MAJOR |
| `PARTY-02` | BOE drawee matches LC stipulated drawee | `BOE` | — | `:42A:` or `:42C:` or `:42D:` populated | AGENT | CRITICAL |
| `XD-01` | Quantity, weight, marks consistent across INV/PKL/BOL | at least 2 of `[INV, PKL, BOL]` | — | — | PROG | MAJOR |
| `XD-02` | Goods description on PKL/BOL not inconsistent with INV/LC | `INV` AND at least one of `[PKL, BOL]` | — | `:45A:` populated | AGENT | MAJOR |
| `CERT-01` | Certificate content satisfies stipulating LC clauses | `BC` OR `WC` | — | clause(s) in `:46A:`/`:47A:` that required the certificate | AGENT | MAJOR |
| `CERT-02` | Certificate signature and form requirements | `BC` OR `WC` | — | LC stipulates signature requirements | AGENT | MAJOR |
| `COND-DYN` | :47A: free-text condition generator (architecture, not a catalog row) | — | — | `:47A:` populated | AGENTIC | varies |

**Trigger semantics — what each column means:**

- **Required docs** — docs this rule needs *as input* to perform its
  check. If all are present → rule executes (yields PASS / FAIL /
  DOUBTS). If any is absent → rule yields `NOT_APPLICABLE` with reason
  *"input doc <X> not presented (see DOCSET-01)"*. Recorded, never
  silent.
- **Optional docs** — referenced if present; absence does not block.
- **LC pre-conditions** — rule yields `NOT_APPLICABLE` if the named LC
  field is empty (e.g., DATE-03 yields NOT_APPLICABLE when LC has no
  `:44C:`).

**Critical clarification — who owns "missing required doc" as a discrepancy:**

There is **only one check**. Intake and Parse stages do not perform any
real *check*; they only produce structural inputs. The real check —
including any prose interpretation, label equivalence, or form
substitution — happens exclusively at the rule layer in **DOCSET-01**.

**What earlier stages actually do (no LLM, no semantic decision):**
- *Intake* classifies uploaded files into doc types via filename
  keyword matching (hardcoded). It does *not* read or interpret `:46A:`.
- *Parse* extracts MT700 tags into `LcParseResult` via structural
  splitting (hardcoded). The text of `:46A:` is captured verbatim;
  it is *not* interpreted into a comparable required-doc list.

Neither of those is a "check." `:46A:` is human prose ("Commercial
invoice in 3 originals signed by beneficiary; Bill of lading marked
freight prepaid; Certificate of origin, Form A acceptable"). Comparing
it to the presented set requires an LLM with knowledge of UCP 14(f)
form equivalences ("Form A" ≡ Cert. of Origin), label normalization
("commercial invoice" ≡ INV), and the LC's own context. That is
DOCSET-01.

**DOCSET-01 owns the entire missing-doc concern:**

```
Inputs   : LC :46A: prose text (from LcParseResult)
           LC :47A: prose (for embedded doc requirements)
           LC :41A:/:42*: (for implicit BOE requirement)
           Presented doc-type list (from Intake's hardcoded classification)
           UCP 14(a), 14(f); ISBP A1 (resolved at runtime)

Output   : CheckResult {
             verdict: PASS | FAIL | DOUBTS
             missing_docs: [...]            // doc requirements not satisfied
             ambiguous_docs: [...]          // requirements that may be satisfied via UCP 14(f)
             citation: UCP-14-a, UCP-14-f, ISBP-A1
             raw_quote: <verbatim :46A: text fragment per discrepancy>
           }
```

If the UI wants a "what does the LC require" preview before Examine
runs (officer awareness), it can **render** the same DOCSET-01 logic in
a *preview mode* (informational only) — no separate hardcoded check
that could drift from the rule layer. One source of truth.

Every other rule that needed a missing doc as input records
`NOT_APPLICABLE` with reason *"input doc <X> not presented (see DOCSET-01)"*.
This avoids three failure modes:

| Anti-pattern | Why we reject it |
|---|---|
| Silent skip of dependent rules | Officer can't tell what *would have* been checked but wasn't. Cascade is invisible. |
| Each dependent rule also reports FAIL | "BOL missing" appears 6+ times (DOCSET-01 + TRANS-01..04 + DOCSET-02 + DATE-03). Noise + double-counting. |
| Intake-stage hardcoded "required-docs check" parallel to DOCSET-01 | Two implementations of the same concern. Hardcoded one cannot interpret prose `:46A:` or apply UCP 14(f). The two will drift; auditors won't know which one was authoritative. Reject. |

**Worked example — LC requires BOL, BOL not presented:**

```
DOCSET-01   → FAIL    "BOL listed in :46A: but not presented"  (the discrepancy)
TRANS-01    → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
TRANS-02    → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
TRANS-03    → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
TRANS-04    → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
DOCSET-02   → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
DATE-02     → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
DATE-03     → NOT_APPLICABLE  "BOL not presented (see DOCSET-01)"
PARTY-01    → executes against remaining docs only
XD-01       → NOT_APPLICABLE  "needs at least 2 of [INV, PKL, BOL]; BOL missing means falls back to INV-PKL only if both present"
```

Officer sees one clear discrepancy plus a transparent cascade.

**Worked example — LC does NOT require BOL, but beneficiary still presents one:**

UCP 14(a) requires examination of *the presentation* — every doc presented
must on its face comply, regardless of whether the LC asked for it. So
TRANS rules run on the presented BOL normally. (DOCSET-01 has nothing
to fail on, since the LC didn't require BOL.)

**Worked example — LC does NOT require BOL, BOL not presented:**

DOCSET-01 has no expectation of BOL → no FAIL. TRANS rules yield
`NOT_APPLICABLE` with reason *"BOL not in this presentation"* — recorded
but not a discrepancy. AMT-02 (needs BOE+INV) has nothing to do with
BOL — unaffected.

The set tracks `production-readiness.md` §5 / §14: one rule per
compliance concern, cross-doc concerns consolidated.

**Type taxonomy — 4 types, no hybrid:**

| Type | Executor | When to use |
|---|---|---|
| `PROG` | SpEL evaluator, no LLM | Comparison fully decidable from extracted fields with deterministic logic. Fastest, cheapest, fully reproducible. Default choice when applicable. |
| `AGENT` | ChatClient single call with structured output | Semantic judgement (correspondence, equivalence, "clean", signature recognition). Chain-of-thought is a *prompt technique* inside an AGENT call — not a separate type. |
| `AGENT_TOOL` | ChatClient + deterministic tools (date math, FX, calculator, lookup) | The rule needs both LLM judgement and a deterministic computation the LLM should not approximate. |
| `AGENTIC` | ChatClient + multi-iteration tool-using loop with iteration cap | Genuine multi-step orchestration where the next step depends on the previous step's output. Reserved for components like `COND-DYN` that decompose-then-dispatch. Avoid for simple rules. |

**`PROG_AGENT` is not a type.** Earlier drafts had it; we removed it
because it conflated infrastructure with prompt technique. A rule that
"first checks a deterministic gate, then reasons about edges" is just
an AGENT (the gate goes inside the prompt) or PROG (the edges are
DOUBTS-able with confidence thresholds). Choose one infra path per
rule; cooperation across types belongs at the prompt level, not the
type level.

---

## 2. Rule definitions

Each rule below carries:
- **Authority** — UCP article and/or ISBP paragraph by id only; text resolves at runtime from `refs/ucp600.yaml`, `refs/isbp821.yaml`.
- **Triggers** — required + optional docs + LC pre-conditions (see §1).
- **Type** — `PROG` · `AGENT` · `PROG_AGENT` · `AGENT_TOOL` · `AGENTIC`.
- **Severity** — `CRITICAL` (refuse) · `MAJOR` (refuse unless waived per UCP 16(c)(iii)) · `MINOR` (advisory only).
- **Rationale** — one paragraph, non-engineer readable.
- **Evidence shape** — what fields/quotes from which docs the rule consumes.
- **POS scenario** and **NEG scenario** — eval seed material.

### 2.1 Date conformance

#### DATE-01 — All presented documents dated in valid window
**Authority:** UCP 14-c, UCP 14-i
**Triggers:** any presented doc (INV / BOL / PKL / BOE / BC / WC) · no LC pre-conditions
**Type:** PROG · **Severity:** MAJOR

**Rationale.** No document may bear a date later than presentation date.
Most docs may not predate the LC `:31C:` issuance, but transport
documents may (UCP 14(i)) when shipped before the LC was issued. The
"issued vs executed" date disambiguation that BC/WC sometimes carry is
resolved at extraction time (extract only the legally-relevant date);
remaining edge cases bubble up via DOUBTS verdict when extraction
confidence is low.

**Evidence.** `doc_date` (with `raw_quote`) from each presented doc; LC `:31C:` (issuance), `:31D:` (expiry); session `presentation_date`.
**Pass.** All doc dates ≤ presentation; all non-transport docs ≥ LC issuance.
**Fail.** INV dated 2026-05-15, presented 2026-05-14.

#### DATE-02 — Presentation within window and before LC expiry
**Authority:** UCP 14-c
**Triggers:** `BOL` required · no LC pre-conditions
**Type:** AGENT_TOOL · **Severity:** CRITICAL

**Rationale.** Presentation must occur within 21 calendar days of
shipment (or the LC-stipulated period in `:48:`) AND on or before LC
expiry `:31D:`. Shipment date is the on-board notation date if present,
else the BOL issue date. Date arithmetic delegated to a tool to keep
the LLM out of calendar math.

**Evidence.** BOL `on_board_date` or `issue_date` (with `raw_quote`); LC `:31D:`, `:48:`; `presentation_date`.
**Pass.** Shipment 2026-04-10, presented 2026-04-25, expiry 2026-05-01, `:48:` absent → 15 days ≤ 21, presented ≤ expiry.
**Fail.** Shipment 2026-04-01, presented 2026-04-25 → 24 days > 21.

#### DATE-03 — Latest shipment date observed
**Authority:** UCP 6-d, MT700 `:44C:`
**Triggers:** `BOL` required · LC `:44C:` populated
**Type:** PROG · **Severity:** CRITICAL

**Rationale.** When the LC carries a latest-shipment date in `:44C:`,
shipment after that date is a critical discrepancy. Determined from
on-board notation date (or BOL issue date if no on-board notation,
where permitted by transport-doc form).

**Evidence.** BOL `on_board_date` or `issue_date`; LC `:44C:`.
**Pass.** Shipment 2026-04-10, `:44C: = 260420`.
**Fail.** Shipment 2026-04-22, `:44C: = 260420`.

---

### 2.2 Amount and currency

#### AMT-01 — Invoice amount and currency conform to LC, within tolerance
**Authority:** UCP 18-b, UCP 30-b
**Triggers:** `INV` required · no LC pre-conditions
**Type:** AGENT_TOOL · **Severity:** CRITICAL

**Rationale.** Invoice currency must match LC `:32B:`. Invoice amount
must be within the LC's stated tolerance (`:39A:` percentage form), or
within UCP 30(b) ±5% if the quantity is not stipulated in stated packing
units. The rule also verifies arithmetic (line items sum to total).
A calculator tool is exposed to the agent for amount-tolerance and
line-item-sum computations so the LLM does not approximate currency
math; the agent invokes it after parsing `:47A:` for any unit-price
override clauses that affect the tolerance basis.

**Evidence.** INV `currency`, `total_amount`, `line_items[]` (with `raw_quote` per item); LC `:32B:`, `:39A:`, `:39B:`, `:47A:` (any unit-price clauses).
**Pass.** INV total USD 124,500.00, LC `:32B: = USD125000,00`, `:39A: = 5/0` → 0.4% under, within 5% under.
**Fail.** INV total EUR 124,500.00 vs LC `:32B: = USD125000,00` (currency mismatch).

#### AMT-02 — Bill-of-exchange amount equals invoice amount and conforms to LC
**Authority:** UCP 18-a, MT700 `:32B:`
**Triggers:** `BOE` AND `INV` required · no LC pre-conditions
**Type:** PROG · **Severity:** CRITICAL

**Rationale.** A draft drawn under the credit must be for the invoice
amount (or the LC-permitted partial amount) and in the LC currency.
Mismatches commonly hide rounding or partial-shipment confusion.

**Evidence.** BOE `amount`, `currency`, `raw_quote`; INV `total_amount`, `currency`; LC `:32B:`.
**Pass.** BOE = INV total = within LC tolerance.
**Fail.** BOE rounded down to nearest hundred while INV total has cents.

---

### 2.3 Document set

#### DOCSET-01 — Every required document is presented
**Authority:** UCP 14-a, UCP 14-f, ISBP A1
**Triggers:** no doc requirement (LC-driven) · LC `:46A:` populated
**Type:** AGENT · **Severity:** CRITICAL

**Rationale.** Each item in `:46A:` (and any documentary requirement
embedded in `:47A:`) must be satisfied by a presented document. Label
equivalences (e.g., "Form A" ≡ Certificate of Origin) and form
equivalences are evaluated by the agent per UCP 14(f). Missing items
yield a structured `missing_docs[]` list for officer review.

**Evidence.** LC `:46A:`, `:47A:`; presented doc-type list (Intake stage output).
**Pass.** `:46A:` lists [Commercial Invoice; Bill of Lading; Packing List]; INV+BOL+PKL presented.
**Fail.** `:46A:` requires Inspection Certificate; none presented (INS out of v2 scope → DOUBTS, not FAIL — see §10).

#### DOCSET-02 — Full set of originals presented (transport doc)
**Authority:** UCP 17, UCP 20-a-iv
**Triggers:** `BOL` required · no LC pre-conditions
**Type:** PROG · **Severity:** CRITICAL

**Rationale.** A bill of lading typically issues in a stated number of
originals (e.g., "3/3"). UCP 17 requires presentation of the full set
of originals as stipulated by the document itself. The rule reads the
"X of Y originals" notation and verifies count.

**Evidence.** BOL `number_of_originals` (e.g., "3/3"), per-original `signed` flag, `raw_quote`.
**Pass.** "3/3" originals presented, all signed.
**Fail.** "3/3" stated; only 2 presented.

---

### 2.4 Goods description

#### GOODS-01 — Invoice goods description corresponds to LC :45A:
**Authority:** UCP 18-c, UCP 14-e, ISBP C3, ISBP A19
**Triggers:** `INV` required · LC `:45A:` populated
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** UCP 18(c) requires the invoice goods description to
*correspond to* the LC `:45A:`. ISBP C3 elaborates: not character-by-
character identical, but in substance — the invoice may legitimately
add details not in the LC, but must not contradict. ISBP A19 admits
typographical variations that do not change meaning. UCP 14(e) carves
out *other documents* (PKL, BOL) which need not "correspond to" — only
"not be inconsistent with." That carve-out is encoded in this rule's
prompt so PKL/BOL are correctly excluded from this check (covered
instead by XD-02).

**Evidence.** INV `goods_description`, INV `off_schema_items` (full prose; including any clauses on page 2+), LC `:45A:`.
**Pass.** LC :45A: "WIDGETS GRADE A"; INV "1,000 PCS WIDGETS GRADE A, MODEL X-12, COLOR BLUE" (added detail, no contradiction).
**Fail.** LC :45A: "WIDGETS GRADE A"; INV "WIDGETS GRADE B".

---

### 2.5 Transport (BOL)

#### TRANS-01 — B/L bears on-board notation and date
**Authority:** UCP 20-a-ii
**Triggers:** `BOL` required · no LC pre-conditions
**Type:** PROG · **Severity:** CRITICAL

**Rationale.** A bill of lading must indicate goods are on board a
named vessel. Where the BOL is issued in "received for shipment" form,
a separate dated on-board notation must be added; where the BOL is
issued in "shipped on board" form, the issuance date *is* the on-board
date unless an explicit on-board notation states otherwise. Extraction
surfaces `bl_form_type` as a structured field; the rule's deterministic
logic then dispatches: `if bl_form_type == "received_for_shipment"`
require explicit on-board notation + date; `if "shipped_on_board"`
treat issue_date as on-board date unless on_board_notation overrides.

**Evidence.** BOL `bl_form_type`, `on_board_notation` (raw quote), `on_board_date`, `vessel_name`.
**Pass.** "RECEIVED FOR SHIPMENT" form, separate on-board notation "SHIPPED ON BOARD VESSEL X 2026-04-10" with signature.
**Fail.** "RECEIVED FOR SHIPMENT" form, no separate on-board notation.

#### TRANS-02 — B/L is clean (no defect/damage clauses)
**Authority:** UCP 27, ISBP D25, ISBP D27
**Triggers:** `BOL` required · no LC pre-conditions
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** A clean transport document bears no clause expressly
declaring a defective condition of the goods or packaging. ISBP D25
clarifies that "shipper's load and count" / "said to contain" notations
do **not** make a B/L unclean. ISBP D27 explains "clean" need not
appear if no defect is shown. The agent scans the entire BOL — including
`off_schema_items`, where most defect clauses live — and applies the
exclusions explicitly.

**Evidence.** BOL all extracted clauses, `off_schema_items[]` (full prose, this is where opaque hand-stamped clauses surface), `raw_quote` of any defect notation.
**Pass.** No defect notations; "shipper's load and count" present (ignored per ISBP D25).
**Fail.** Stamped notation "BAGS TORN, CONTENTS LEAKING".

#### TRANS-03 — Ports of loading and discharge match LC
**Authority:** UCP 20-a-iii
**Triggers:** `BOL` required · LC `:44E:` and/or `:44F:` populated
**Type:** AGENT · **Severity:** CRITICAL

**Rationale.** Where the LC stipulates ports, the BOL must indicate
those ports. Generic stipulations ("ANY CHINESE PORT", "EUROPEAN PORT")
and `:47A:` overrides require semantic interpretation; the prompt
instructs the agent to first attempt literal match and escalate to
geographic/category reasoning only when the LC value is non-literal.

**Evidence.** BOL `port_of_loading`, `port_of_discharge`; LC `:44E:`, `:44F:`, `:47A:` overrides.
**Pass.** LC :44E: "ANY CHINESE PORT"; BOL POL "SHANGHAI".
**Fail.** LC :44E: "PORT KLANG"; BOL POL "SINGAPORE".

#### TRANS-04 — Freight terms conform to LC and Incoterm
**Authority:** UCP 26, ISBP D7, ISBP D8
**Triggers:** `BOL` AND `INV` required · no LC pre-conditions
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** The Incoterm on the invoice (CIF, FOB, etc.) determines
who bears freight, which must be reflected on the BOL via "freight
prepaid" or "freight collect" notations. UCP 26 prohibits a transport
document indicating the goods are or will be loaded *on deck* unless
the LC permits it; that prohibition is also encoded here. The agent
reads INV `incoterm`, BOL `freight_terms`, and BOL `off_schema_items`
(where freight clauses often live as stamps), and reasons about
consistency.

**Evidence.** INV `incoterm` (with `raw_quote`); BOL `freight_terms`, `on_deck_notation`, `off_schema_items` (where freight clauses often live).
**Pass.** INV "CIF HAMBURG"; BOL "FREIGHT PREPAID".
**Fail.** INV "CIF HAMBURG"; BOL "FREIGHT COLLECT".

---

### 2.6 Parties

#### PARTY-01 — Beneficiary and applicant identity consistent across all documents
**Authority:** UCP 14-j, ISBP A6, ISBP A19, ISBP A39
**Triggers:** any doc carrying beneficiary or applicant identity · LC `:50:` and `:59:` populated
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** The beneficiary appears as INV issuer, BOL shipper or
consignee, PKL issuer, BOE drawer, BC/WC issuer; the applicant appears
as INV buyer/consignee, BOL notify-party or consignee. Names and
addresses must be consistent across these positions. ISBP A19 admits
typographical variations that do not change meaning; ISBP A39 covers
UCP 14(j) on address details not needing exact match.

**Evidence.** Party fields with `raw_quote` from every presented doc; LC `:50:`, `:59:`.
**Pass.** All instances of the beneficiary spell the name identically; address omits suite number on PKL but is otherwise the same.
**Fail.** INV issuer "ACME INTERNATIONAL CORP" vs BOL shipper "ACME INC" — distinct legal entities, not a typo.

#### PARTY-02 — Bill-of-exchange drawee matches LC stipulated drawee
**Authority:** MT700 `:42A:`/`:42C:`/`:42D:`
**Triggers:** `BOE` required · LC `:42A:` or `:42C:` or `:42D:` populated
**Type:** AGENT · **Severity:** CRITICAL

**Rationale.** The party on whom the draft is drawn must be the bank
named in `:42A:`/`:42C:`/`:42D:` of the LC. The agent reconciles BIC,
bank name, and address variants in one pass — literal BIC equality is
attempted first inside the prompt, then name/address tolerance per
ISBP A19/A39.

**Evidence.** BOE `drawee`, `raw_quote`; LC `:42A:`, `:42C:`, `:42D:`.
**Pass.** BOE drawee "BANK OF X, BIC BANKBIC1"; LC `:42A: = BANKBIC1`.
**Fail.** BOE drawee "OTHER BANK CO" vs LC `:42A: = BANKBIC1`.

---

### 2.7 Cross-document consistency

#### XD-01 — Quantity, weight, and shipping marks consistent across INV, PKL, BOL
**Authority:** UCP 14-e, ISBP C2, ISBP C12, ISBP C14
**Triggers:** at least 2 of `[INV, PKL, BOL]` present · no LC pre-conditions
**Type:** PROG · **Severity:** MAJOR

**Rationale.** Quantity (units, weight, packages), measurements, and
shipping marks must agree across documents. Numeric reconciliation
runs with unit normalization (kg ↔ MT, etc.) and shipping-mark string
presence checks. Structural variability (per-carton breakdown vs
aggregate; consolidated-container manifests; packing-list line-item
sums; multi-line marks blocks) is handled by extraction shaping the
data into a comparable form upstream. If extraction confidence on a
needed component is low, the rule yields DOUBTS rather than silently
proceeding.

**Evidence.** Quantities, weights, package counts, marks blocks (each with `raw_quote`) from each present doc.
**Pass.** INV "1,000 PCS / 5,000 KG NET / 5,200 KG GROSS"; PKL totals "1,000 PCS / 5,000 KG / 5,200 KG"; BOL "1,000 PCS / 5,200 KG GROSS".
**Fail.** INV 1,000 PCS; PKL totals 950 PCS.

#### XD-02 — Goods description on PKL/BOL not inconsistent with INV/LC
**Authority:** UCP 14-e
**Triggers:** `INV` AND at least one of `[PKL, BOL]` present · LC `:45A:` populated
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** UCP 14(e) permits PKL and BOL to describe goods in
general terms but prohibits *inconsistency* with the LC and INV. The
agent reads the goods description on each non-INV doc and checks
against INV/LC for contradiction (different model number, different
grade, different commodity), not for verbatim correspondence.

**Evidence.** Goods descriptions and `off_schema_items` from PKL, BOL, INV; LC `:45A:`.
**Pass.** INV "WIDGETS GRADE A MODEL X-12"; BOL "WIDGETS"; PKL "1000 PCS WIDGETS".
**Fail.** INV "WIDGETS GRADE A"; BOL "WIDGETS GRADE B".

---

### 2.8 Certificates (BC and WC)

#### CERT-01 — Certificate content satisfies stipulating LC clauses
**Authority:** UCP 14-a, UCP 14-f, ISBP Q1, ISBP Q3
**Triggers:** `BC` OR `WC` present · LC `:46A:`/`:47A:` clause(s) requiring the certificate
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** A beneficiary certificate or warranty certificate must
literally satisfy every condition of the `:46A:` / `:47A:` clauses that
required it. The agent extracts the relevant LC clauses (or receives
them from the :47A: dynamic generator), reads the certificate body in
full (including `off_schema_items`), and reports per-clause coverage
with quoted evidence. Both BC and WC use the same logic — one rule.

**Evidence.** BC/WC body, `off_schema_items`, `raw_quote` of relevant text; LC `:46A:`, `:47A:`.
**Pass.** :47A: required "BC stating goods comply with EU Reg 2023/45"; BC body asserts "We hereby certify that the goods supplied comply with EU Regulation 2023/45 in all respects".
**Fail.** :47A: required statement of contract number XYZ-123 in BC; BC silent on contract.

#### CERT-02 — Certificate signature and form requirements
**Authority:** ISBP A35, ISBP Q3
**Triggers:** `BC` OR `WC` present · LC stipulates signature requirements
**Type:** AGENT · **Severity:** MAJOR

**Rationale.** Where the LC requires a certificate to be signed (or
signed by a specific party), the signature must be present and
authored by the stipulated party. The agent receives `signature_present`,
`signature_party`, `signature_raw_quote` from extraction plus the LC
signing stipulation; signature presence and signed-by reconciliation
are evaluated in one pass.

**Evidence.** BC/WC `signature_present`, `signature_party`, `signature_raw_quote`; LC `:46A:`/`:47A:` signing stipulations.
**Pass.** LC requires "signed by beneficiary"; BC bears beneficiary signature with name.
**Fail.** LC requires signature; BC bears no signature mark of any kind.

---

## 3. The :47A: dynamic rule generator — AGENTIC component

Per `production-readiness.md` §6, :47A: handling is a pipeline component
that runs at the start of Examine and emits N condition-rules per
session into `dynamic_rules`. It is **not** counted as a static rule.

**This is the only AGENTIC component in v2.** It needs multi-step
orchestration: (1) read `:47A:` prose and split into atomic conditions;
(2) for each condition, classify `check_kind`, identify `applies_to_docs`,
infer `polarity` and `severity`, identify relevant UCP/ISBP refs; (3) for
each non-`OUT_OF_SCOPE` condition, generate a check prompt template
that resolves citation text from the corpus. Steps 2 and 3 run per
condition with bounded iteration. Static rules don't need this shape;
COND-DYN does.

```
Input  : LC :47A: prose (with raw line ranges), :46A: items,
         set of presented doc types, UCP/ISBP corpus
Output : List<DynamicCondition>{
            id (sha256-keyed for cache), source_text (raw_quote),
            applies_to_docs[], polarity (POS|NEG),
            severity (CRITICAL|MAJOR|MINOR — model-suggested,
                      officer-reviewable),
            ucp_refs[], isbp_refs[],
            check_kind (ASSERT_PRESENT | ASSERT_EQUALS |
                        ASSERT_FORMAT | ASSERT_ABSENT |
                        OUT_OF_SCOPE),
            check_prompt (templated — combines source_text with
                          ref text and target-doc evidence shape)
         }
```

Each non-`OUT_OF_SCOPE` DynamicCondition runs as an inline AGENT or
AGENT_TOOL check, writing a `CheckResult` exactly like a static rule.
`OUT_OF_SCOPE` items are recorded in `officer_actions` with the
generator's reason so the officer can override.

The generator orchestrates: parse → per-condition classify → per-condition
prompt-template generation, with an iteration cap (default 6) and
total-token budget per session. The catalog has no static `COND-*` rule.

---

## 4. Coverage check vs the 80th-percentile real-refusal causes

From `production-readiness.md` §8:

| Refusal cause | Approx % of real refusals | Static rule(s) | Coverage |
|---|---|---|---|
| Late presentation / past expiry | 12 | DATE-02 | ✓ |
| Description discrepancy | 14 | GOODS-01 | ✓ |
| Doc inconsistencies (qty/marks/desc) | 17 | XD-01, XD-02 | ✓ |
| Missing or wrong-form documents | 10 | DOCSET-01 | ✓ |
| Late shipment | 8 | DATE-03 | ✓ |
| Insurance defects | 6 | (out of scope — INS not in v2) | OOS |
| BOL defects (clean / on-board / full set / ports / freight) | 12 | TRANS-01..04, DOCSET-02 | ✓ |
| :47A: custom-condition defects | 10 | COND-DYN generator | ✓ |
| Goods qty / packing-list inconsistency | 5 | XD-01 | ✓ |
| Other | 6 | various | partial |

In-scope coverage: ~94% (exclude insurance). The static-plus-dynamic
rule set hits the 80th-percentile target.

---

## 5. Migration map — current 23 rules → new 18 rules

The current catalog dissolves into the consolidated set as follows:

| Current rule | Disposition |
|---|---|
| `GEN-001` "every doc complies on face" | Dissolved — generic restatement of UCP 14(a); not a discrete check. |
| `GEN-003` "no doc dated later than presentation" | Folded into `DATE-01`. |
| `INV-001` "issued by beneficiary" | Folded into `PARTY-01` (issuer identity). |
| `INV-003` "same currency as LC" | Folded into `AMT-01`. |
| `INV-005` "amount must not exceed LC" | Folded into `AMT-01`. |
| `INV-006` "goods description corresponds to :45A:" | → `GOODS-01`. |
| `BOL-003` "on-board / notation" | → `TRANS-01`. |
| `BOL-005` "ports of loading/discharge" | → `TRANS-03`. |
| `BOL-007` "full set of originals" | → `DOCSET-02`. |
| `BOL-009` "B/L is clean" | → `TRANS-02`. |
| `PKL-003` "qty in PKL not contradicting INV" | Folded into `XD-01`. |
| `PKL-004` "marks in PKL not contradicting BOL" | Folded into `XD-01`. |
| `BOE-001` "draft drawn on party stated in LC" | → `PARTY-02`. |
| `BOE-003` "draft amount = invoice amount" | → `AMT-02`. |
| `BC-001` "BC content satisfies :46A: conditions" | → `CERT-01`. |
| `BC-003` "BC bears beneficiary signature" | → `CERT-02`. |
| `WC-001` "WC content satisfies :46A: conditions" | → `CERT-01` (BC + WC unified). |
| `XD-004` "INV qty matches PKL" | Folded into `XD-01`. |
| `XD-022` "beneficiary across all docs" | → `PARTY-01`. |
| `XD-024` "Incoterm vs BOL freight" | → `TRANS-04`. |
| `COND-01` "BC :47A: handling" | Replaced by `COND-DYN` generator. |
| `COND-02` "WC :47A: handling" (disabled) | Replaced by `COND-DYN`. |
| `COND-03` "universal :47A:" (disabled) | **Becomes** `COND-DYN` — the generator IS this rule, properly designed. |

**New net coverage** (rules in new set with no equivalent in current
catalog):
- `DATE-03` (latest shipment date) — current has no equivalent.
- `AMT-01` arithmetic component — partial in current `AMT-03`, now folded.

---

## 6. Out of scope (explicit)

- **LC self-validation against UCP/ISBP** (UCP 6, 30, 38, ISBP A1/A22).
  Belongs to the issuing bank at issuance time. v2 sits at the
  presentation/examination stage; we do not re-litigate the LC.
- **Insurance documents (INS), Certificate of Origin (COO),
  Inspection certificates.** Reference catalog covers them; v3.
- **Non-marine transport docs** (AWB, CMR, RWB). v3.
- **Translation of foreign-language docs.** Monolingual constraint; documented in officer-facing copy.
- **RAG on examine path.** Settled in `production-readiness.md` §2.

---

## 7. What this document does NOT decide

- **Per-rule prompt content.** `prompts/check/<RULE_ID>.tokenized.st`
  bodies are Phase-2-Workstream-2 (after agreement on this doc).
- **Per-rule evidence schema in `field-pool.yaml`.** Each rule's
  `evidence_shape` may add fields (e.g., BOL `bl_form_type`,
  `signed_originals_count`); enumerated in the spike plan.
- **The :47A: generator's full prompt.** Sketched in §3; full prompt
  is Phase-2-Workstream-3.
- **Eval corpus.** Each rule has one POS / one NEG seed scenario above;
  expanding to a curated eval set is Phase-2-Workstream-5.
- **Severity calibration via real refusal data.** Current severities
  reflect ICC DOCDEX patterns; bank-specific tuning is post-launch.

---

## 8. Type distribution (after PROG_AGENT removal)

| Type | Count | Rules |
|---|---|---|
| `PROG` | 6 | DATE-01, DATE-03, AMT-02, DOCSET-02, TRANS-01, XD-01 |
| `AGENT` | 10 | DOCSET-01, GOODS-01, TRANS-02, TRANS-03, TRANS-04, PARTY-01, PARTY-02, XD-02, CERT-01, CERT-02 |
| `AGENT_TOOL` | 2 | DATE-02, AMT-01 |
| `AGENTIC` | 1 (component, not catalog) | COND-DYN |

Static catalog total: 18. AGENTIC sits outside the static catalog.

---

## 9. Decisions needed before Phase-2 spike plan

1. **Rule total: 18 static + 1 AGENTIC dynamic generator.** Acceptable,
   or prune/expand?
2. **Severity assignments** — any specific rule you'd reclassify?
3. **`CERT-01` unifies BC + WC into one rule.** Confirm — or split
   for officer-UI clarity (two rule cards instead of one)?
4. **`GEN-001` dissolves entirely** (it was a UCP 14(a) restatement).
   Confirm acceptable, or restore as a sanity-cap rule?

Once these settle, Phase-2 spike plan (file-level edits) follows.
