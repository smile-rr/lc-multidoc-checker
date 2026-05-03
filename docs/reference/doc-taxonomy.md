# LC Document Taxonomy, AI Examination Pitfalls & System Roadmap

> **Basis**: UCP 600 (ICC Pub. 600, 2007) + ISBP 821 (ICC Pub. 821E, 2023)  
> **Scope**: Document classification, AI-specific checking pitfalls, V1→V3 coverage roadmap

---

## PART 1 — Complete LC Document Classification

### Category 1 — Core Essential Documents
*Required by almost every LC · UCP 600 dedicated articles*

| # | Code | Full Name | Core Checking Focus |
|---|------|-----------|---------------------|
| ① | INV | Commercial Invoice | Beneficiary/applicant/currency/amount/goods description/Incoterms |
| ② | BOL | Bill of Lading | On-board notation/carrier signature/ports/full set originals/clean |
| ③ | PKL | Packing List | Quantity/weight/shipping marks consistent with invoice and B/L |

### Category 2 — High-Frequency Documents
*Most LCs require these · Covered by dedicated UCP/ISBP sections*

| # | Code | Full Name | Core Checking Focus |
|---|------|-----------|---------------------|
| ④ | BOE | Bill of Exchange / Draft | Drawee/drawer/amount = invoice/maturity date calculation |
| ⑤ | INS | Insurance Policy / Certificate | Amount ≥ CIF × 110% / currency / risks / insurance date ≤ shipment date |
| ⑥ | COO | Certificate of Origin | Issuer / country of origin not contradicting invoice |
| ⑦ | BC | Beneficiary Certificate | Satisfies every condition in LC Field 46A / exact timeframe wording |

### Category 3 — Common Additional Documents
*Appear by cargo type or buyer requirement · Checked under generic certificate rules (ISBP Part Q)*

| # | Code | Full Name | Typical Use Case |
|---|------|-----------|-----------------|
| ⑧ | WC | Warranty Certificate | Mechanical / electronic equipment |
| ⑨ | WL | Weight List / Weight Certificate | Bulk cargo / commodities (ore, grain, chemicals) |
| ⑩ | IC | Inspection Certificate | Buyer-nominated inspector (SGS / BV / CCIC etc.) |
| ⑪ | PSI | Pre-shipment Inspection Certificate | Must prove inspection occurred before shipment date |
| ⑫ | AC | Analysis / Test Certificate | Chemicals / food / raw materials |
| ⑬ | HC | Health Certificate | Food / agricultural products / medical devices |
| ⑭ | PHY | Phytosanitary Certificate | Plants / plant products / wood packaging |
| ⑮ | FUM | Fumigation Certificate | Wood packaging entering specific countries (AU, US, etc.) |

### Category 4 — Alternative Transport Documents
*Substitute for standard B/L · UCP Art. 19–25*

| Code | Full Name | Notes |
|------|-----------|-------|
| MTD | Multimodal Transport Document | |
| AWB | Air Waybill | |
| CPBOL | Charter Party Bill of Lading | |
| SWB | Non-negotiable Sea Waybill | |
| RTD | Road / Rail / Inland Waterway Document | |
| CRR | Courier Receipt | |

### Category 5 — Financial Documents

| Code | Full Name |
|------|-----------|
| CI | Customs Invoice |
| CoI | Consular Invoice |
| DN | Debit / Credit Note |

### Category 6 — Government / Regulatory Certificates

| Code | Full Name |
|------|-----------|
| EL | Export / Import License |
| VC | Veterinary / Sanitary Certificate |
| DGD | Dangerous Goods Declaration |
| RAD | Radiation Certificate |

### Category 7 — Auxiliary Logistics Documents
*Not transport documents under UCP Art. 19–25 · Checked under Art. 14(f) · 21-day rule does NOT apply*

| Code | Full Name | Notes |
|------|-----------|-------|
| FCR | Forwarder's Certificate of Receipt | Not a title document |
| FCT | Forwarder's Certificate of Transport | Often confused with MTD |
| MR | Mate's Receipt | Temporary receipt before formal B/L |
| DO | Delivery Order | Destination pickup voucher, not a transport contract |
| LEG | Legalised / Notarised Documents | Mandatory for some import countries |

---

## PART 2 — 12 AI Examination Pitfalls

### Pitfall 01 — "Non-contradictory" ≠ "Identical"
UCP Art. 14(d) requires only that documents **do not contradict** each other, not that they match word-for-word.
- Invoice: "CNC Lathe Model X-200" / B/L: "Machinery" → **not contradictory, acceptable**
- Invoice: "Model X-200" / B/L: "Model X-100" → **direct contradiction, discrepant**

LLM prompts must explicitly distinguish these two judgments. Without this, the LLM flags all "not completely identical" cases as discrepancies, producing massive false positives.

### Pitfall 02 — Date Logic Has Three Critical Points
1. **On-board notation date ≠ B/L issuance date** — when an on-board notation exists, its date is the shipment date and the start point for the 21-day window and draft tenor. Extracting the wrong date corrupts all downstream date calculations.
2. **"On or about" clause** — Art. 3 interprets this as a ±5-day window (11 days total). AI must detect vague time expressions in the LC.
3. **Multiple B/Ls: use the latest on-board date** — the latest date starts the 21-day clock, and no B/L date may exceed the LC's latest shipment date.

### Pitfall 03 — Amount Tolerance Has a Three-Layer Priority Stack
Many systems treat these as three parallel rules — they have a strict priority order:

| Priority | Condition | Tolerance |
|----------|-----------|-----------|
| Highest | LC explicitly states tolerance (e.g. ±3%) | Use LC figure |
| 2nd | LC uses "about / approximately" | ±10% on quantity and amount |
| 3rd | Bulk goods / non-unit measurement | Quantity ±5%, but drawn amount must not exceed LC total |
| Default | All other cases | Exact LC amount; no overdraw allowed |

**Common mistake**: interpreting "quantity ±5%" as "amount ±5%" — if quantity decreases by 5%, the drawn amount must decrease proportionally; no overdrawing permitted.

### Pitfall 04 — Incoterms Trigger a Cascade of Checks
Once the Incoterms are extracted from the invoice, a whole chain of related checks must fire automatically:
- **CIF / CFR** → B/L must show "Freight Prepaid"; insurance must exist and be ≥ 110%
- **FOB** → B/L must show "Freight Collect"; insurance is buyer's responsibility, usually not presented
- **CIP** → similar to CIF but applies to multimodal transport

Incoterms run through invoice, B/L, and insurance — this is the highest-risk area for cross-document contradictions.

### Pitfall 05 — Document Set Completeness Check Must Come Before Content Checks
Before checking individual document content, a set-level pre-check is mandatory:
> Parse LC Field 46A → build required-document list → compare against received files → mark missing docs as MISSING → flag insufficient originals (e.g., 3 required, 1 submitted) separately.

Missing documents are an automatic discrepancy and must not enter the content-checking pipeline. This layer is the most basic gate in practice, yet is frequently omitted from system designs.

### Pitfall 06 — The LC Itself May Contain Internal Contradictions
Common examples:
- Latest shipment date is later than LC expiry date (physically impossible to present in time)
- Transhipment prohibited but named port requires transhipment to reach
- Full 3/3 B/L set required but transhipment prohibition makes this impossible

UCP Art. 14(h): contradictory terms are treated as not stated. The system should run an **LC self-consistency check** after parsing the MT700, flag these contradictions, and avoid generating false-positive rule failures against unenforceable terms.

### Pitfall 07 — Negative Language Is an LLM Weakness
LCs use negative conditions heavily:
- "must **not** indicate on-deck stowage"
- "Transhipment **prohibited**"
- "Invoice must **not** show any deduction"

LLMs make significantly more errors on negation than on positive rules. Recommended mitigations:
- Tag negative rules distinctly in the rule catalog
- Escalate high-risk negation rules (e.g., partial shipment prohibition) to deterministic code checks — do not rely on LLM
- Explicitly state in the prompt: "This is a prohibition condition — presence = discrepancy"

### Pitfall 08 — Discrepancy Severity Grading (Output Should Not Be Binary)
In banking practice, discrepancies carry different weights:

| Level | Examples | Typical Outcome |
|-------|----------|-----------------|
| **CRITICAL** | Currency mismatch, late presentation, amount exceeds LC, beneficiary ≠ seller | Near-certain refusal, not waivable |
| **MAJOR** | Goods description contradiction, wrong port, B/L not on-board | Typically causes refusal |
| **MINOR** | Address format variation, acceptable abbreviations, minor typos | May be waived or accepted |

Severity grading lets human reviewers quickly triage which items can go through the waiver process vs. direct refusal.

### Pitfall 09 — VLM Extraction Confidence Must Be Stratified
Field extraction difficulty varies significantly:

| Confidence Level | Field Examples | Routing |
|-----------------|---------------|---------|
| **High** | Amount, date, port code, LC number, currency | Proceed directly to Type A checks |
| **Medium** | Multi-line consignee text, Incoterms buried in description, weight unit | Secondary verification required |
| **Low** | Handwritten on-board notations, stamps overlapping text, endorsements, multilingual certs, corrections | Route directly to human review (Type C) |

Treating all extracted values as equally reliable causes large numbers of false discrepancies on low-confidence fields.

### Pitfall 10 — Waiver Process Design (Discrepancy ≠ Refusal)
Art. 16(b) allows the issuing bank to release documents with applicant consent despite discrepancies. Each discrepancy in system output should include:
- Discrepancy description, severity level, relevant LC field and actual field value
- **Waivable?** (CRITICAL items are generally non-waivable)
- Waiver action prompt (e.g., "requires applicant written consent")

This transforms the system from "find discrepancies" into "support business decisions."

### Pitfall 11 — Beneficiary / Warranty Certificates Are the Most LC-Dependent Document Types
These two document types have no dedicated UCP/ISBP rules — their content is entirely defined by LC Fields 46A/47A. This means:
- LC Field 46A must be parsed first to extract all certification requirements
- Every requirement must be individually addressed in the certificate — aggregation or omission is not acceptable
- Timeframe wording must match the LC exactly ("within 5 days" ≠ "within 7 days")
- Referenced invoice/B/L numbers must match the actual documents exactly

These documents represent the highest-value scenario for LLM semantic understanding — rules are defined entirely in natural language and cannot be exhaustively enumerated in code.

### Pitfall 12 — Auxiliary Logistics Documents ≠ Transport Documents (21-Day Rule Does Not Apply)
FCR (Forwarder's Certificate of Receipt), MR (Mate's Receipt), DO (Delivery Order), and similar documents are **not** transport documents under UCP Art. 19–25. Therefore:
- The 21-day presentation period (Art. 14(c)) does **not** apply to them
- They are checked under Art. 14(f) — generic document rules
- They cannot serve as title documents (only formal B/Ls carry title)

The system must correctly classify document types at intake to avoid computing presentation deadlines against FCRs or treating them as B/L substitutes.

---

## PART 3 — System Document Coverage Roadmap

> **Design principle**: UCP Art. 14(f) states that for documents where the LC does not specify issuer or content, any document that functionally satisfies the purpose is acceptable. Therefore Cat. 3–4 certificates do not require new rules — they reuse the **Beneficiary Certificate generic framework** (ISBP Part Q).

### V1 — Core Coverage (Current)
INV · BOL · PKL · BOE · BC · WC  
+ LC completeness pre-check (Field 46A set validation)  
+ LC self-consistency check layer (contradictory term detection)

### V2 — Important Expansion
INS · COO · WL · IC · AWB · MTD  
+ Discrepancy severity grading output (CRITICAL / MAJOR / MINOR)  
+ Waiver process annotation on each discrepancy

### V3 — On-Demand Expansion
PSI · HC · PHY · FUM · AC · CPBOL  
*(Reuse BC generic certificate framework — no new rule engine required)*

---

*Basis: UCP 600 (ICC Publication No. 600, 2007) | ISBP 821 (ICC Publication No. 821E, 2023)*  
*For system use only — not a reproduction of ICC publications*
