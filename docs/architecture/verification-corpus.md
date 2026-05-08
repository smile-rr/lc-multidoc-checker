# Verification Corpus

**Status:** Phase 2 deliverable (W7) — manual-walkthrough SoT.
**Date:** 2026-05-07
**Companions:** `rule-set.md` (the 18 rules + COND-DYN), `production-readiness.md`
(architecture), `spike-plan.md` (W1–W7).
**Purpose.** For each test bundle, document the per-rule expected verdict
under a *clean run* of the new pipeline. Compare actual against expected
during manual walkthrough; mismatches become bug tickets, not rule rewrites
(the corpus is authoritative — rules and prompts iterate against it).

Project convention: no automated tests. This file is the regression
checkpoint between any two runs of the spike.

---

## How to use this file

1. Run `make svc` and `make ui`. Open the UI.
2. For each bundle below, drag-drop the bundle's `mt700.txt` + 6 PDFs.
3. Let the pipeline run through Examine + Sign-off.
4. Compare each rule's actual verdict against the table for that bundle.
5. For COND-DYN, count the dynamic conditions emitted; compare to the
   count below; spot-check three condition outputs.

Verdict legend:
- **PASS** — rule expects PASS on a clean extraction.
- **FAIL** — rule expects FAIL on this bundle (genuine discrepancy).
- **DOUBTS** — rule may emit DOUBTS where extraction confidence is uncertain.
- **N/A** — `NOT_APPLICABLE` expected (input doc absent OR LC pre-condition empty).
- **?** — unknown without empirically running the bundle; record what comes out.

---

## Bundle 01 — `01-widgets-singapore`

**LC headline:** USD 60,000 ±10% · expiry 2025-12-31 SINGAPORE · :44C: 2024-12-31
· :44E: PORT KLANG, MALAYSIA · :44F: SINGAPORE · applicant SINO IMPORTS HK ·
beneficiary WIDGET EXPORTS PTE SG · 500 industrial widgets FOB Port Klang.

**:46A: requires:** Commercial Invoice (1 orig + 3 copies, quoting LC number);
Packing List (3 copies); Beneficiary's Certificate stating Singapore origin +
pre-shipment inspection.

**:47A: free-text conditions** (drives COND-DYN):
- Invoice must quote LC number AND contract no. WIDG-PO-2024-0317
- All documents must bear LC number
- All documents must be in English

**Presented documents:** INV, BOL, PKL, BOE, BC, WC.
(`:46A:` does not require BOL/BOE/WC explicitly but they are presented; UCP 14(a)
examines all presented docs.)

**Expected per-rule verdicts (clean run):**

| Rule | Verdict | Notes |
|---|---|---|
| `DATE-01` | PASS | All doc dates ≤ presentation date |
| `DATE-02` | PASS | Within 21-day window + before LC expiry |
| `DATE-03` | PASS | Shipment date ≤ 2024-12-31 |
| `AMT-01` | PASS | Invoice = USD 60,000 ±10% |
| `AMT-02` | PASS | BOE amount = INV total |
| `DOCSET-01` | PASS | INV + PKL + BC presented; BOL/BOE/WC are extra (UCP 14(a) examines all presented anyway) |
| `DOCSET-02` | PASS | BOL full set originals stated and presented |
| `GOODS-01` | PASS | INV goods = "INDUSTRIAL WIDGETS MODEL IW-2024" matches :45A: |
| `TRANS-01` | PASS | BOL on-board notation present and dated |
| `TRANS-02` | PASS | BOL clean; "shipper's load and count" if present is excluded per ISBP D25 |
| `TRANS-03` | PASS | POL=PORT KLANG, POD=SINGAPORE — match :44E:/:44F: |
| `TRANS-04` | PASS | Incoterm FOB → BOL "freight collect" (FOB → buyer pays freight) |
| `PARTY-01` | PASS | Beneficiary WIDGET EXPORTS consistent across docs; applicant SINO IMPORTS consistent |
| `PARTY-02` | N/A | LC has no `:42A:`/`:42C:`/`:42D:` populated → drawee_bic empty → rule NOT_APPLICABLE |
| `XD-01` | PASS | Quantity/weight/marks consistent across INV/PKL/BOL |
| `XD-02` | PASS | PKL/BOL goods description not inconsistent with INV/LC |
| `CERT-01` | PASS | BC body satisfies "Singapore origin" + "inspected prior to shipment" stipulations |
| `CERT-02` | DOUBTS or PASS | LC does not explicitly require signature on BC; BC carries signature → PASS expected, but rule may emit NOT_APPLICABLE if no signing stipulation parsed |

**Expected COND-DYN behavior:**

The :47A: has 3 clauses → expect 3 dynamic conditions (one per bullet):

| # | Source clause | applies_to_docs | check_kind | Expected verdict |
|---|---|---|---|---|
| 1 | "INVOICE MUST QUOTE LC NUMBER AND CONTRACT NO. WIDG-PO-2024-0317" | [INV] | ASSERT_PRESENT | PASS if INV shows both LC number AND contract WIDG-PO-2024-0317; FAIL otherwise |
| 2 | "ALL DOCUMENTS MUST BEAR LC NUMBER" | [INV, BOL, PKL, BOE, BC, WC] | ASSERT_PRESENT | PASS if every presented doc shows the LC number somewhere; FAIL listing missing docs |
| 3 | "ALL DOCUMENTS MUST BE IN ENGLISH" | [INV, BOL, PKL, BOE, BC, WC] | ASSERT_FORMAT | PASS — all docs are in English by construction |

Cache key for COND-DYN should be stable across re-runs of this bundle; second
run logs `COND-DYN cache hit`.

---

## Bundle 02 — `02-apparel-acme`

**LC headline:** USD 50,000 ±10% · applicant DESPORTS GMBH (Germany) ·
beneficiary ACME APPAREL CO LTD · USA-origin apparel.

**:46A: requires:** Commercial Invoice (1 orig + 3 copies, quoting LC number);
Packing List (3 copies); Beneficiary's Certificate stating USA origin +
pre-shipment inspection.

**:47A: free-text conditions:**
- Invoice must quote LC number AND contract no. APP-PO-2025-1110
- All documents must bear LC number
- All documents must be in English

**Presented documents:** INV, BOL, PKL, BOE, BC, WC.

**Expected per-rule verdicts (clean run):**

| Rule | Verdict | Notes |
|---|---|---|
| `DATE-01` | PASS | |
| `DATE-02` | PASS | |
| `DATE-03` | ?  | Depends on bundle's :44C: vs BOL on-board date — record |
| `AMT-01` | PASS | INV total within USD 50,000 ±10% |
| `AMT-02` | PASS | BOE = INV |
| `DOCSET-01` | PASS | |
| `DOCSET-02` | PASS | |
| `GOODS-01` | PASS | INV goods description corresponds to :45A: apparel description |
| `TRANS-01` | PASS | |
| `TRANS-02` | PASS | |
| `TRANS-03` | ? | Depends on bundle's POL/POD. Record actual. |
| `TRANS-04` | ? | Incoterm-driven. Record. |
| `PARTY-01` | PASS | DESPORTS / ACME APPAREL identifiable across docs |
| `PARTY-02` | N/A | No `:42*:` populated |
| `XD-01` | PASS | |
| `XD-02` | PASS | |
| `CERT-01` | PASS | BC body satisfies USA origin + inspection |
| `CERT-02` | DOUBTS or PASS | As bundle 01 |

**Expected COND-DYN behavior:** 3 conditions (same shape as bundle 01 but
contract no. APP-PO-2025-1110).

---

## Bundle 03 — `03-painting-artfinder`

**LC headline:** **GBP 100** ±10% · applicant ANGELA ROLDAN (individual,
not company) · beneficiary CESCA FALATO (individual) · ONE original
painting.

**:46A: requires:** Commercial Invoice (1 orig + 3 copies, quoting LC number);
**No PKL required**; Beneficiary's Certificate stating the painting is an
original work by the beneficiary + pre-shipment inspection.

**:47A: free-text conditions:**
- Invoice must quote LC number AND contract no. ART-PO-2022-0617
- All documents must bear LC number
- All documents must be in English

**Presented documents:** INV, BOL, PKL, BOE, BC, WC. (PKL presented even
though :46A: does not require it; UCP 14(a) examines all presented anyway.)

**Expected per-rule verdicts (clean run):**

| Rule | Verdict | Notes |
|---|---|---|
| `DATE-01` | PASS | |
| `DATE-02` | PASS | |
| `DATE-03` | ? | Record |
| `AMT-01` | PASS | INV ≈ GBP 100 ±10% (small amount; rounding sensitive — watch arithmetic tool) |
| `AMT-02` | PASS | |
| `DOCSET-01` | PASS | INV + BC required and present; PKL extra |
| `DOCSET-02` | PASS | BOL full set; sometimes paintings ship as one original — verify |
| `GOODS-01` | PASS | INV "original painting by [beneficiary]" matches :45A: |
| `TRANS-01` | PASS | |
| `TRANS-02` | PASS | |
| `TRANS-03` | ? | Record (artwork transport often air-freight not maritime — may not have POL/POD in BOL) |
| `TRANS-04` | ? | Likely small-amount sea-freight CIF |
| `PARTY-01` | PASS | Individuals — name match across docs |
| `PARTY-02` | N/A | |
| `XD-01` | PASS or N/A | One painting; quantity reconciliation may be trivial |
| `XD-02` | PASS | |
| `CERT-01` | PASS | BC body satisfies "original work by [beneficiary]" + "inspected" stipulations |
| `CERT-02` | DOUBTS or PASS | |

**Expected COND-DYN behavior:** 3 conditions (contract no. ART-PO-2022-0617).
Edge case: small monetary amount + individual parties may make AGENT prompts
emit lower confidence — not a defect.

---

## Bundle 04 — `04-boots-baton-rouge`

**LC headline:** USD 490 ±10% · applicant 634 HIGH LAKE DR (Baton Rouge,
Louisiana — individual address only) · beneficiary GLOBAL UK LIMITED · boots.

**:46A: requires:** Commercial Invoice (1 orig + 3 copies — note: NO requirement
to quote LC number); Packing List (3 copies). **No BC/WC required.**

**:47A: free-text conditions:**
- All documents must be in English (only one clause)

**Presented documents:** INV, BOL, PKL, BOE, BC, WC. (BC and WC presented
despite not being required by :46A:.)

**Expected per-rule verdicts (clean run):**

| Rule | Verdict | Notes |
|---|---|---|
| `DATE-01` | PASS | |
| `DATE-02` | PASS | |
| `DATE-03` | ? | |
| `AMT-01` | PASS | INV ≈ USD 490 ±10% (very small amount; watch arithmetic) |
| `AMT-02` | PASS | |
| `DOCSET-01` | PASS | INV + PKL required and present; BC/WC extras |
| `DOCSET-02` | PASS | |
| `GOODS-01` | PASS | |
| `TRANS-01` | PASS | |
| `TRANS-02` | PASS | |
| `TRANS-03` | ? | |
| `TRANS-04` | ? | |
| `PARTY-01` | PASS | Note: applicant's :50: parses oddly ("634 HIGH LAKE DR" looks like an address, not a name). Watch for `applicant_name` extraction quality. |
| `PARTY-02` | N/A | |
| `XD-01` | PASS | |
| `XD-02` | PASS | |
| `CERT-01` | N/A or PASS | LC has no certificate stipulation; BC/WC presented anyway. CERT-01 trigger requires `:46A:` or `:47A:` clause — no clause referring to certs in this LC → CERT-01 NOT_APPLICABLE. |
| `CERT-02` | N/A | Same reason |

**Expected COND-DYN behavior:** 1 condition only (the English-language clause).

| # | Source clause | applies_to_docs | check_kind | Expected verdict |
|---|---|---|---|---|
| 1 | "ALL DOCUMENTS MUST BE IN ENGLISH" | [INV, BOL, PKL, BOE, BC, WC] | ASSERT_FORMAT | PASS — all docs are in English |

---

## NOT_APPLICABLE cascade — explicit verification (W5 contract)

In addition to the verdicts above, the W5 contract requires testing that
missing-doc cascades produce `NOT_APPLICABLE` (not silent skip, not FAIL)
on every dependent rule.

**Test protocol:** for bundle 01, *delete the BOL* before submission; re-run.

Expected:
- `DOCSET-01` → **FAIL** with "missing required doc" reason (this is the
  one and only missing-doc discrepancy).
- `DOCSET-02` → **NOT_APPLICABLE** with reason citing BOL absent / see DOCSET-01.
- `TRANS-01..04` → **NOT_APPLICABLE** each, same reason.
- `DATE-02`, `DATE-03` → **NOT_APPLICABLE** (require BOL).
- `XD-01` (with INV+PKL still present) → **PASS or DOUBTS** (BOL absent
  but at-least-2-of triggers still met by INV+PKL).
- All other rules → unchanged.

**Test protocol:** for bundle 04, *delete the BC AND WC* before submission;
re-run.

Expected:
- `CERT-01`, `CERT-02` → **NOT_APPLICABLE** (no BC, no WC).
- All other rules → unchanged from bundle 04 baseline.

---

## Type / extraction provenance — sanity (W1, W2 contract)

Spot-check on any one bundle:
- Open `v_doc_extracts_consensus` for INV — every extracted field that has a
  `value` should also have a `raw_quote` set (W1 contract).
- `off_schema_items[]` on BOL non-empty (carrier clauses, conditions of
  carriage, etc.) (W2 contract).
- A field like `incoterms` on INV carries the verbatim Incoterm clause as
  `raw_quote`, not just the term ("CIF HAMBURG" raw_quote = "CIF HAMBURG
  (Incoterms 2020)" or similar surrounding context).

---

## Citation resolution — sanity (W3 contract)

Spot-check on one AGENT rule (e.g. `GOODS-01`):
- Open the trace for the rule's LLM call (`/tmp/lc-checker-v2/svc.log` or
  Langfuse).
- The system prompt should contain the actual UCP 18(c) text (resolved from
  `refs/ucp600.yaml`), not the literal token `{{ref.UCP-18-c.text}}`.
- An intentionally bad token like `{{ref.UCP-99-z.text}}` injected into a
  prompt template should fail-fast at startup (test only with a throwaway
  YAML edit).

---

## Walkthrough record (per session)

For each bundle run, record actual outcomes in a working sheet (paper, or
session-overview UI export) with columns: `rule_id`, `expected`, `actual`,
`note`. Mismatches go to bug tickets:

- **Verdict mismatch with no extraction concern** → rule logic or prompt bug.
- **Verdict mismatch traced to a missing or wrong field value** → extraction
  prompt issue (W2 follow-up).
- **NOT_APPLICABLE where a verdict was expected** → trigger evaluator bug
  (W4/W5 follow-up).
- **COND-DYN emitted fewer/more conditions than expected** → decomposer
  prompt bug (W6 follow-up).
- **COND-DYN cache miss on identical re-run** → caching bug (W6 follow-up).

---

## What this corpus is NOT

- Not a full eval framework. We have no automated harness; this is a
  human-readable expected-vs-actual grid.
- Not exhaustive of edge cases. Bundle 03 (small amount, individual
  parties) and bundle 04 (sparse :46A:/:47A:) probe two corners; many more
  exist (multilingual docs, transferable LCs, partial shipments).
- Not authoritative for severity or polarity calibration. Severities here
  are the catalog defaults; bank-specific policies may revise them.

When the rule set evolves, this corpus must be updated in lockstep — it is
the regression checkpoint, not a snapshot.
