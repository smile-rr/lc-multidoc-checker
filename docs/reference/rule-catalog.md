# UCP 600 & ISBP 821 — Complete LC Document Checking Rules Reference
## All Document Types: Invoice · B/L · Packing List · Bill of Exchange · Beneficiary Certificate · Warranty Certificate · Insurance · Certificate of Origin

> **Scope**: Full multi-document rule catalog for automated LC checker system  
> **Basis**: UCP 600 (ICC Pub. No. 600, 2007) + ISBP 821 (ICC Pub. No. 821E, 2023)  
> **Last Updated**: 2026-05  
> **Check Types**: A = Deterministic code | B = LLM semantic | C = Human review

---

## PART 0 — UNIVERSAL RULES (Apply to ALL Documents)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| GEN-001 | ALL | Art.14a | A1–A9 | Every document must comply on its face with LC terms and conditions | A | Any field value contradicts LC = discrepancy |
| GEN-002 | ALL | Art.14d | A1, B1 | Data in any document must not contradict data in any other stipulated document or the LC | B | Invoice qty 500, Packing List qty 1000 = contradiction |
| GEN-003 | ALL | Art.14i | A19 | No document may be dated later than its date of presentation | A | Document dated tomorrow, presented today = discrepant |
| GEN-004 | ALL | Art.14h | A19 | Document may be dated before LC issuance date, but not after presentation date | A | Document pre-dated before LC issue = acceptable |
| GEN-005 | ALL | Art.14c | — | Presentation must be made within 21 calendar days after shipment date and not later than LC expiry | A | Presented day 22 after B/L date = late presentation |
| GEN-006 | ALL | Art.17 | A27–A28 | At least one original of each stipulated document must be presented | A | Only copy submitted when original required = discrepant |
| GEN-007 | ALL | Art.14a | A14 | Commonly accepted abbreviations are not discrepancies (Ltd, Co., Int'l, etc.) | B | "Co." instead of "Company" = acceptable |
| GEN-008 | ALL | Art.14a | A15 | Minor spelling/typing errors that do not change meaning are not discrepancies | B | "Indusrial" vs "Industrial" = acceptable; "Model 123" vs "Model 321" = discrepant |
| GEN-009 | ALL | Art.14e | A12 | In documents other than invoice, goods description may be in general terms, not conflicting with LC | B | B/L: "Machinery" when LC says "CNC Machines" = check for conflict |
| GEN-010 | ALL | Art.14j | A20 | Beneficiary and applicant addresses must be within same country as stated in LC, not necessarily identical | A | Invoice shows applicant in wrong country = discrepant |
| GEN-011 | ALL | Art.3 | A19 | Signatures may be handwritten, facsimile, stamp, electronic or mechanical authentication | B | Rubber stamp signature = acceptable |
| GEN-012 | ALL | Art.16 | — | All discrepancies must be raised in a single notice; bank precluded after 5 banking days | A | System must aggregate all discrepancies before output |
| GEN-013 | ALL | Art.14f | — | Documents not required by LC must be disregarded; if submitted may be returned | A | Extra document attached = ignore, do not fail |
| GEN-014 | ALL | — | A9 | Corrections/alterations on documents issued by third parties must be authenticated by issuer | B | Uncrossed correction on B/L with no authentication = discrepant |
| GEN-015 | ALL | — | A10 | Corrections/alterations on beneficiary-issued documents (except drafts) need not be authenticated | B | Correction on invoice without authentication = acceptable |

---

## PART 1 — COMMERCIAL INVOICE (INV)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| INV-001 | INV | Art.18a(i) | C6 | Invoice must appear to be issued by the beneficiary | A | Invoice issuer ≠ beneficiary name in LC Field 59 = discrepant |
| INV-002 | INV | Art.18a(ii) | C5 | Invoice must be made out in the name of the applicant | A | Buyer name on invoice ≠ LC Field 50 applicant = discrepant |
| INV-003 | INV | Art.18a(iii) | C8 | Invoice must be in the same currency as the LC | A | LC in USD, invoice in EUR = discrepant |
| INV-004 | INV | Art.18a(iv) | C2 | Invoice need not be signed unless LC explicitly requires it | B | Unsigned invoice when LC Field 46A says "Signed Invoice" = discrepant |
| INV-005 | INV | Art.18b | C9 | Invoice amount must not exceed the LC amount | A | Invoice USD 51,000 vs LC USD 50,000 = discrepant |
| INV-006 | INV | Art.18c | C3 | Goods description on invoice must correspond with LC Field 45A | B | Invoice description more general than LC = discrepant |
| INV-007 | INV | Art.18c | C3 | Invoice description may be more specific than LC but not more general | B | LC: "Widgets IW-2024 CIF Singapore"; Invoice: "Widgets" = discrepant |
| INV-008 | INV | Art.18b | C4 | If LC stipulates unit price, invoice must reflect same unit price | A | LC: USD 50/unit; Invoice: USD 55/unit = discrepant |
| INV-009 | INV | Art.18b | C8 | Trade term (Incoterms) on invoice must match LC | A | LC: CIF Singapore; Invoice: FOB Hamburg = discrepant |
| INV-010 | INV | Art.14c | — | Invoice date must be within 21-day presentation window from B/L date | A | Invoice date day 22+ after B/L = late |
| INV-011 | INV | Art.14i | A19 | Invoice date must not be later than presentation date | A | Invoice dated after bank receipt date = discrepant |
| INV-012 | INV | Art.14e | C5 | Applicant address must be in same country as LC Field 50; need not be identical | A | Wrong country for applicant = discrepant; different postcode = acceptable |
| INV-013 | INV | Art.14e | C6 | Beneficiary address must be in same country as LC Field 59; need not be identical | A | Wrong country for beneficiary = discrepant |
| INV-014 | INV | Art.30a | C3 | If LC uses "about/approximately", ±10% tolerance on quantity/amount | A | LC "about 1000 units"; Invoice 1050 = within tolerance |
| INV-015 | INV | Art.30b | C3 | If LC has no "about" and no specific packing units, ±5% quantity tolerance allowed | A | LC 1000 MT; Invoice 952 MT = discrepant (>5%) |
| INV-016 | INV | Art.30c | — | Invoice amount may be less than LC amount (underdrawing) | A | Invoice USD 40,000 vs LC USD 50,000 = acceptable |
| INV-017 | INV | — | C1 | If LC requires LC number on invoice, its absence is discrepant | B | LC Field 46A: "Invoice must quote LC No." and invoice omits it = discrepant |
| INV-018 | INV | — | C7 | If LC requires country of origin on invoice, its absence is discrepant | B | LC requires "Country of Origin: Germany"; invoice silent = discrepant |
| INV-019 | INV | — | C10 | Charges on invoice must be consistent with trade term; total must not exceed LC amount | A | CIF invoice: freight itemized separately inflating total above LC = discrepant |
| INV-020 | INV | Art.14d | C9 | Multiple invoices: combined total must not exceed LC amount | A | 3 invoices totalling USD 52,000 vs LC USD 50,000 = discrepant |
| INV-021 | INV | — | C3 | Invoice must not show merchandise not called for in LC, even if stated free of charge | B | Invoice shows "free sample" not in LC = discrepant |
| INV-022 | INV | Art.28f | E1 | If CIF invoice, insurance must be at least 110% of invoice value | A | CIF USD 100,000; insurance USD 100,000 = discrepant (must be ≥ USD 110,000) |

---

## PART 2 — BILL OF LADING (BOL)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| BOL-001 | BOL | Art.20a(i) | D14 | B/L must indicate name of carrier and be signed by carrier, master, or named agent | A | No carrier name or unsigned B/L = discrepant |
| BOL-002 | BOL | Art.20a(i) | D14 | Agent signing B/L must identify as agent and state on whose behalf signing | B | Agent signs but does not identify carrier = discrepant |
| BOL-003 | BOL | Art.20a(ii) | D20 | B/L must indicate goods shipped on board named vessel at port of loading stated in LC | A | No on-board notation and no pre-printed "shipped on board" = discrepant |
| BOL-004 | BOL | Art.20a(ii) | D20 | B/L issuance date = shipment date unless separate on-board notation exists | A | On-board notation date overrides issuance date for 21-day calculation |
| BOL-005 | BOL | Art.20a(iii) | D21 | B/L must show shipment from port of loading to port of discharge as stated in LC | A | B/L port of loading ≠ LC Field 44E = discrepant |
| BOL-006 | BOL | Art.20a(iii) | D21 | If B/L shows "intended" port of loading, on-board notation must state actual port | B | "Intended: Port Klang" without on-board correction = discrepant |
| BOL-007 | BOL | Art.20a(iv) | D16 | Full set of originals must be presented as indicated on B/L (e.g., 3/3 originals) | A | Only 2/3 originals presented = discrepant |
| BOL-008 | BOL | Art.20a(vi) | — | B/L must not indicate it is subject to charter party | A | "Subject to charter party" clause on B/L = discrepant (use Art.22 instead) |
| BOL-009 | BOL | Art.27 | D25 | B/L must be clean — no notation declaring defective condition of goods or packaging | B | "Packaging damaged" notation on B/L = discrepant |
| BOL-010 | BOL | Art.20c | D23 | Transhipment clause: B/L may indicate transhipment if entire carriage on one B/L | B | Transhipment prohibited in LC but goods in container = may be acceptable |
| BOL-011 | BOL | Art.14d | D1 | Port of loading/discharge on B/L must not contradict invoice or LC | A | B/L: Penang to Singapore; Invoice: Port Klang to Singapore = contradiction |
| BOL-012 | BOL | Art.14e | D15 | Goods description on B/L may be general but must not conflict with LC or invoice | B | B/L: "Goods" when invoice says "Industrial Widgets IW-2024" = check conflict |
| BOL-013 | BOL | Art.14d | D2 | Consignee field must match LC instructions (to order / to order of bank / named party) | A | LC: "to order of issuing bank"; B/L: "to order of applicant" = discrepant |
| BOL-014 | BOL | — | D22 | If B/L issued to order of shipper, must be endorsed by shipper | B | "To order of shipper" B/L with no endorsement = discrepant |
| BOL-015 | BOL | Art.26 | — | "Shipper's load and count" / "said by shipper to contain" clauses acceptable | B | These notations = NOT discrepant |
| BOL-016 | BOL | Art.26a | — | B/L must not indicate goods loaded on deck (unless LC permits) | B | "On deck" notation without LC permission = discrepant |
| BOL-017 | BOL | — | D24 | Freight notation must match Incoterms: CIF/CFR = "Freight Prepaid"; FOB = "Freight Collect" | A | CIF but B/L shows "Freight Collect" = contradiction with invoice Incoterms |
| BOL-018 | BOL | Art.20a(ii) | D20 | If "intended vessel" shown, on-board notation must confirm actual vessel name and date | A | "Intended vessel: MV Pacific" with no on-board notation = discrepant |
| BOL-019 | BOL | Art.14c | — | B/L date (= shipment date) triggers the 21-day presentation window | A | B/L dated April 1; presentation deadline = April 22 |
| BOL-020 | BOL | Art.14j | D21 | Notify party field: if LC stipulates notify party, B/L must reflect same | B | LC specifies notify party; B/L notify field blank = discrepant |

---

## PART 3 — PACKING LIST (PKL)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| PKL-001 | PKL | Art.14f | H1 | Packing List issuer: LC determines who issues; if not stated, any party may issue | B | LC requires "beneficiary's packing list"; third party issues = discrepant |
| PKL-002 | PKL | Art.14d | H2 | Goods description on packing list must not contradict LC or invoice | B | PKL: "500 cartons"; Invoice: "500 cartons" = consistent |
| PKL-003 | PKL | Art.14d | H3 | Quantity/number of packages on packing list must not contradict invoice or B/L | A | PKL: 100 cartons; Invoice: 120 cartons = contradiction = discrepant |
| PKL-004 | PKL | Art.14d | H4 | Shipping marks on packing list must not contradict B/L | A | PKL marks: "ABC/SIN/001-100"; B/L marks: "ABC/SIN/001-080" = contradiction |
| PKL-005 | PKL | Art.14e | H2 | Goods description may be general but must not conflict with LC description | B | PKL: "Machine parts" when LC/Invoice: "CNC Lathe Model X-200" = check conflict |
| PKL-006 | PKL | — | H5 | Packing list must not contain price/value information (price belongs on invoice only) | B | PKL shows unit price = may be treated as additional invoice = flag for review |
| PKL-007 | PKL | Art.14a | H1 | Packing list need not be signed unless LC explicitly requires | B | Unsigned PKL when LC says "Signed Packing List" = discrepant |
| PKL-008 | PKL | Art.14i | A19 | Packing list must not be dated later than presentation date | A | PKL dated after bank receipt = discrepant |
| PKL-009 | PKL | Art.14d | H3 | Net weight, gross weight, and measurements must not contradict B/L or other docs | A | PKL gross weight 5,000 KG; B/L gross weight 4,200 KG = contradiction |
| PKL-010 | PKL | Art.41 | H1 | Title need not exactly match: "Packing Note", "Packing and Weight List" etc. are all acceptable | B | Document titled "Weight and Packing List" = acceptable for "Packing List" requirement |
| PKL-011 | PKL | Art.14d | H4 | Number of packages/cartons on PKL must equal number on B/L | A | PKL: 200 cartons; B/L: 200 cartons = compliant |

---

## PART 4 — BILL OF EXCHANGE / DRAFT (BOE)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| BOE-001 | BOE | Art.6 | B1 | Draft must be drawn on the party stated in the LC (issuing bank or nominated bank) | A | LC: drawn on ABC Bank; Draft: drawn on applicant = discrepant |
| BOE-002 | BOE | Art.6 | B2 | Draft must be drawn by the beneficiary | A | Draft drawer ≠ beneficiary = discrepant |
| BOE-003 | BOE | — | B3 | Draft amount must equal invoice amount | A | Draft USD 48,000; Invoice USD 50,000 = discrepant |
| BOE-004 | BOE | Art.18b | B3 | Draft currency must match LC currency | A | LC in USD; Draft in GBP = discrepant |
| BOE-005 | BOE | Art.18b | B3 | Draft amount must not exceed LC amount | A | Draft USD 55,000 vs LC USD 50,000 = discrepant |
| BOE-006 | BOE | — | B4 | Tenor must comply with LC payment terms (Sight / 30/60/90 days etc.) | A | LC: 60 days after B/L date; Draft shows "at sight" = discrepant |
| BOE-007 | BOE | — | B5 | If tenor references B/L date, on-board date is used even if different from B/L issuance date | A | B/L issued April 1, on-board notation April 3; tenor starts April 3 |
| BOE-008 | BOE | — | B6 | Maturity date must be correctly calculated from tenor and B/L date | A | 60 days after April 1 = May 31; draft shows June 1 = discrepant |
| BOE-009 | BOE | — | B7 | Draft must reference LC number and issuing bank | B | No LC number on draft = check if LC requires it |
| BOE-010 | BOE | — | B8 | Draft must be signed by beneficiary (drawer signature required) | A | Unsigned draft = discrepant |
| BOE-011 | BOE | — | B9 | Amount in words must match amount in figures | A | Words: "Fifty Thousand USD"; Figures: USD 55,000 = discrepant |
| BOE-012 | BOE | Art.14i | A19 | Draft must not be dated later than presentation date | A | Draft dated after bank receipt = discrepant |
| BOE-013 | BOE | — | B10 | Corrections/alterations on draft must be authenticated by drawer (beneficiary) | B | Uncorrected amendment on draft without drawer's counter-signature = discrepant |
| BOE-014 | BOE | Art.6c | — | LC must not be issued available by draft drawn on applicant | A | If draft drawn on applicant = system flag for review |

---

## PART 5 — BENEFICIARY CERTIFICATE (BC)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| BC-001 | BC | Art.14f | Q1 | Beneficiary certificate content must satisfy all conditions stated in LC Field 46A exactly | B | LC requires "certificate that documents sent within 5 days"; certificate says "within 10 days" = discrepant |
| BC-002 | BC | Art.14f | Q2 | Certificate must be issued by beneficiary unless LC states otherwise | A | LC: "Beneficiary's Certificate"; issued by freight forwarder = discrepant |
| BC-003 | BC | Art.14a | Q3 | If LC requires "signed beneficiary certificate", it must bear beneficiary's signature | A | LC says "signed certificate"; unsigned certificate = discrepant |
| BC-004 | BC | Art.14i | A19 | Certificate must not be dated later than presentation date | A | Certificate dated after bank receipt = discrepant |
| BC-005 | BC | Art.14d | Q4 | If certificate references invoice number, B/L number, or shipment date, these must match corresponding documents | A | Certificate references Invoice No. 001; actual invoice is No. 002 = discrepant |
| BC-006 | BC | Art.14d | Q5 | Certificate must not contradict any other stipulated document | B | Certificate says "shipped on April 1"; B/L shows April 5 = contradiction |
| BC-007 | BC | — | Q6 | If LC requires LC number on certificate, its absence = discrepant | B | LC Field 46A: "Certificate must quote LC No."; certificate omits = discrepant |
| BC-008 | BC | Art.14f | Q1 | Each specific certification requirement in LC must be individually addressed in the certificate | B | LC requires 3 separate certifications; certificate only covers 2 = discrepant |
| BC-009 | BC | — | Q7 | Timeframe stated in certificate (e.g., "within 5 days of shipment") must match LC requirement | A | LC: "within 5 days"; Certificate: "within 7 days" = discrepant |
| BC-010 | BC | Art.14a | A19 | Date format acceptable in any unambiguous format | B | "23rd April 2026" = acceptable |

---

## PART 6 — WARRANTY CERTIFICATE (WC)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| WC-001 | WC | Art.14f | Q1 | Warranty certificate content must satisfy all conditions stated in LC Field 46A | B | LC: "12-month warranty from shipment date"; certificate: "6-month warranty" = discrepant |
| WC-002 | WC | Art.14f | Q2 | Issuer must be the party stated in LC (manufacturer / beneficiary / named party) | A | LC: "Manufacturer's Warranty Certificate"; issued by trading company = discrepant |
| WC-003 | WC | Art.14a | Q3 | If LC requires signed warranty certificate, unsigned = discrepant | A | No signature when LC requires it = discrepant |
| WC-004 | WC | Art.14d | Q4 | Technical specification/model described in warranty must not contradict invoice goods description | B | Warranty covers "Model X-100"; Invoice says "Model X-200" = contradiction |
| WC-005 | WC | Art.14i | A19 | Warranty certificate must not be dated later than presentation date | A | Certificate dated after bank receipt = discrepant |
| WC-006 | WC | Art.14d | Q5 | Warranty period start date must be consistent with shipment date or B/L date | B | Warranty starts "from date of manufacture" when LC requires "from date of shipment" = discrepant |
| WC-007 | WC | Art.14d | — | Quantity covered by warranty must not contradict invoice quantity | A | Warranty covers 500 units; Invoice: 1000 units = contradiction |
| WC-008 | WC | — | Q6 | If LC requires LC number on warranty, its absence = discrepant | B | LC Field 46A requires LC No. on warranty; absent = discrepant |
| WC-009 | WC | Art.14e | — | Manufacturer address, if stated, must be in correct country per LC | A | LC specifies German manufacturer; warranty shows Chinese address = flag for review |

---

## PART 7 — INSURANCE DOCUMENT (INS)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| INS-001 | INS | Art.28a | K1 | Insurance must appear issued and signed by insurance company, underwriter, or their agent | A | Unsigned insurance document = discrepant |
| INS-002 | INS | Art.28b | K2 | If issued in more than one original, all originals must be presented | A | Insurance issued in 2 originals; only 1 presented = discrepant |
| INS-003 | INS | Art.28c | — | Cover notes are not acceptable | A | Cover note submitted instead of policy/certificate = discrepant |
| INS-004 | INS | Art.28e | K3 | Insurance date must not be later than shipment date | A | Insurance dated after B/L date = discrepant |
| INS-005 | INS | Art.28f(i) | K4 | Insurance must be in same currency as LC | A | LC in USD; insurance in GBP = discrepant |
| INS-006 | INS | Art.28f(ii) | K5 | Insurance amount must be at least 110% of CIF/CIP invoice value | A | CIF invoice USD 100,000; insurance USD 105,000 = discrepant (must be ≥ USD 110,000) |
| INS-007 | INS | Art.28f(iii) | K6 | Insurance must cover risks at least from place of shipment to place of discharge/destination | B | Insurance coverage ends at port of loading = discrepant |
| INS-008 | INS | Art.28g | K7 | Insurance must cover risks specified in LC; imprecise terms ("usual risks") = accept as-is | B | LC: "all risks"; policy shows Institute Cargo Clauses (A) = acceptable |
| INS-009 | INS | Art.28h | K8 | "All risks" requirement satisfied by any "all risks" notation even if exclusions listed | B | Policy shows "all risks" with war exclusion = acceptable |
| INS-010 | INS | Art.14d | K9 | Goods description and shipment details on insurance must not contradict invoice or B/L | B | Insurance covers "electronic goods"; Invoice says "mechanical parts" = contradiction |

---

## PART 8 — CERTIFICATE OF ORIGIN (COO)

| Rule ID | DocType | UCP | ISBP 821 | Rule Description | Check Type | Discrepancy Example |
|---------|---------|-----|----------|-----------------|------------|---------------------|
| COO-001 | COO | Art.14f | L1 | Certificate of origin must be issued by the party stated in LC | A | LC: "Chamber of Commerce Certificate of Origin"; beneficiary issues own = discrepant |
| COO-002 | COO | Art.14f | L2 | If LC requires beneficiary/exporter/manufacturer to issue, chamber of commerce CoO also acceptable | B | LC: "issued by beneficiary"; CoO from chamber of commerce clearly identifying beneficiary = acceptable |
| COO-003 | COO | Art.14d | L3 | Country of origin on CoO must not contradict invoice | A | CoO: "Made in China"; Invoice: "Made in Germany" = contradiction |
| COO-004 | COO | Art.14d | L4 | Goods description on CoO may be general but must not conflict with LC or invoice | B | CoO: "machinery"; Invoice: "CNC Lathe X-200" = check for conflict |
| COO-005 | COO | Art.14d | L5 | Consignee info on CoO must not contradict transport document | B | CoO consignee differs from B/L consignee = contradiction |
| COO-006 | COO | Art.14i | A19 | CoO must not be dated later than presentation date | A | CoO dated after bank receipt = discrepant |
| COO-007 | COO | — | L6 | CoO must be signed unless LC states otherwise | A | Unsigned CoO when LC requires signed = discrepant |
| COO-008 | COO | Art.14d | K1 | Country of origin on CoO must be consistent with warranty certificate if both present | B | CoO: Germany; Warranty: "Manufactured in China" = contradiction |

---

## PART 9 — CROSS-DOCUMENT CONSISTENCY RULES

These rules apply when multiple documents are present in the same presentation.

| Rule ID | DocType Pair | UCP | ISBP 821 | Rule Description | Check Type |
|---------|-------------|-----|----------|-----------------|------------|
| XD-001 | INV ↔ BOL | Art.14d | D1 | Port of loading/discharge: Invoice (if stated) must match B/L | A |
| XD-002 | INV ↔ BOL | Art.14d | D2 | Shipment date on B/L must be on or before LC latest shipment date | A |
| XD-003 | INV ↔ BOL | Art.14d | D3 | Goods description: Invoice vs B/L must not contradict | B |
| XD-004 | INV ↔ PKL | Art.14d | H3 | Quantity in Invoice must match Packing List | A |
| XD-005 | INV ↔ PKL | Art.14d | H3 | Number of packages/cartons: Invoice vs PKL must not contradict | A |
| XD-006 | BOL ↔ PKL | Art.14d | H4 | Shipping marks: PKL vs B/L must not contradict | A |
| XD-007 | BOL ↔ PKL | Art.14d | H3 | Weight: PKL gross weight vs B/L gross weight must not contradict | A |
| XD-008 | INV ↔ BOE | Art.14d | B3 | Draft amount must equal Invoice amount | A |
| XD-009 | INV ↔ BOE | Art.14d | B3 | Draft currency must match Invoice currency | A |
| XD-010 | BOL ↔ BOE | Art.14d | B5 | Draft tenor start date must reference correct B/L on-board date | A |
| XD-011 | INV ↔ BC | Art.14d | Q4 | Invoice number referenced in Beneficiary Certificate must match actual invoice | A |
| XD-012 | BOL ↔ BC | Art.14d | Q4 | B/L number and date referenced in Beneficiary Certificate must match actual B/L | A |
| XD-013 | INV ↔ WC | Art.14d | Q5 | Goods model/description in Warranty must not contradict Invoice | B |
| XD-014 | INV ↔ WC | Art.14d | — | Quantity in Warranty must not contradict Invoice quantity | A |
| XD-015 | INV ↔ INS | Art.28f | K5 | Insurance amount ≥ 110% of CIF invoice value | A |
| XD-016 | INV ↔ INS | Art.14d | K9 | Insurance currency must match Invoice currency | A |
| XD-017 | BOL ↔ INS | Art.28e | K3 | Insurance date must not be later than B/L date (shipment date) | A |
| XD-018 | INV ↔ COO | Art.14d | L3 | Country of origin: Invoice vs CoO must not contradict | A |
| XD-019 | BOL ↔ COO | Art.14d | L5 | Consignee on CoO vs B/L must not contradict | B |
| XD-020 | WC ↔ COO | Art.14d | — | Country of manufacture on Warranty vs CoO must not contradict | B |
| XD-021 | INV ↔ BOL | Art.14c | — | Presentation date must be within 21 days of B/L on-board date | A |
| XD-022 | ALL docs | Art.14d | B1 | Beneficiary name must be consistent across all documents | B |
| XD-023 | ALL docs | Art.14d | B1 | Applicant name must be consistent across all documents | B |
| XD-024 | INV ↔ BOL | Art.18c | D15 | Incoterms on invoice must be consistent with freight notation on B/L | A |

---

## PART 10 — QUICK CROSS-REFERENCE MATRIX (All Doc Types)

| Check Dimension | DocType | UCP 600 Article | ISBP 821 Section | Check Type |
|----------------|---------|-----------------|-----------------|------------|
| Issuer identity | INV | 18a(i) | C6 | A |
| Issuer identity | BOL | 20a(i) | D14 | A |
| Issuer identity | BOE | Art.6 | B2 | A |
| Issuer identity | BC | 14f | Q2 | A |
| Issuer identity | WC | 14f | Q2 | A |
| Issuer identity | INS | 28a | K1 | A |
| Issuer identity | COO | 14f | L1 | A |
| Issuer identity | PKL | 14f | H1 | B |
| Applicant name | INV | 18a(ii) | C5 | A |
| Applicant name | BOL (consignee) | 14d | D15 | A |
| Applicant name | ALL | 14d | B1 | B |
| Beneficiary name | INV | 18a(i) | C6 | A |
| Beneficiary name | BOE (drawer) | Art.6 | B2 | A |
| Beneficiary name | BC | 14f | Q2 | A |
| Beneficiary name | ALL | 14d | B1 | B |
| Currency | INV | 18a(iii) | C8 | A |
| Currency | BOE | 18b | B3 | A |
| Currency | INS | 28f(i) | K4 | A |
| Amount ≤ LC | INV | 18b | C9 | A |
| Amount ≤ LC | BOE | 18b | B3 | A |
| Amount = Invoice | BOE | 14d | B3 | A |
| Amount ≥ 110% CIF | INS | 28f(ii) | K5 | A |
| Goods description | INV | 18c | C3 | B |
| Goods description | BOL | 14e | D15 | B |
| Goods description | PKL | 14e | H2 | B |
| Goods description | WC | 14d | Q5 | B |
| Goods description | COO | 14d | L4 | B |
| Goods description | INS | 14d | K9 | B |
| Incoterms / Trade term | INV | 18b,18c | C8 | A |
| Incoterms / Trade term | BOL (freight) | 14d | D24 | A |
| Port of loading | BOL | 20a(iii) | D21 | A |
| Port of loading | INV (if stated) | 14d | D1 | A |
| Port of discharge | BOL | 20a(iii) | D21 | A |
| Port of discharge | INV (if stated) | 14d | D1 | A |
| Shipment date | BOL | 20a(ii) | D20 | A |
| Shipment date | INS (≤ B/L date) | 28e | K3 | A |
| Document date ≤ presentation | ALL | 14i | A19 | A |
| Presentation within 21 days | ALL | 14c | — | A |
| Signature required | INV | 18d | C2 | B |
| Signature required | BOE | Art.6 | B10 | A |
| Signature required | BC | 14f | Q3 | A |
| Signature required | WC | 14f | Q3 | A |
| Signature required | INS | 28a | K1 | A |
| Signature required | COO | 14f | L7 | A |
| Full set of originals | BOL | 20a(iv) | D16 | A |
| Full set of originals | INS | 28b | K2 | A |
| Clean document | BOL | Art.27 | D25 | B |
| Country of origin | INV (if required) | 18c | C7 | B |
| Country of origin | COO | 14d | L3 | A |
| Country consistency (addresses) | INV | 14j | C5,C6 | A |
| Country consistency (addresses) | ALL | 14j | A20 | A |
| LC number reference | INV (if required) | 18a | C1 | B |
| LC number reference | BOE | — | B9 | B |
| LC number reference | BC | — | Q6 | B |
| Abbreviations / minor typos | ALL | 14a | A14,A15 | B |
| Quantity tolerance ±5% | INV,PKL | 30b | C3 | A |
| Quantity tolerance ±10% ("about") | INV,PKL | 30a | C3 | A |
| Shipping marks consistency | PKL ↔ BOL | 14d | H4 | A |
| Weight consistency | PKL ↔ BOL | 14d | H3 | A |
| Tenor/maturity calculation | BOE | Art.6 | B5–B8 | A |
| Insurance coverage route | INS | 28f(iii) | K6 | B |
| Multiple invoices total | INV | 14d,18b | C9 | A |
| Corrections authenticated | ALL (3rd party) | — | A9 | B |

---

## PART 11 — RULE APPLICABILITY MATRIX BY LC FIELD

| LC Field | Field Name | Documents Affected | Key Rules Triggered |
|----------|-----------|-------------------|-------------------|
| Field 31C | Date of Issue | ALL | GEN-004 — docs may predate LC issue |
| Field 31D | Expiry Date | ALL | GEN-005 — presentation must be before expiry |
| Field 32B | Currency & Amount | INV, BOE, INS | INV-003, INV-005, BOE-004, BOE-005, INS-005 |
| Field 39A | Percentage Credit Amount Tolerance | INV, BOE | INV-016, INV-014, INV-015 |
| Field 41 | Available With/By | BOE | BOE-001, BOE-006 |
| Field 42C | Drafts at | BOE | BOE-006, BOE-007, BOE-008 |
| Field 42A | Drawee | BOE | BOE-001 |
| Field 43P | Partial Shipments | BOL, INV | BOL-010, INV-015 |
| Field 43T | Transhipment | BOL | BOL-010 |
| Field 44E | Port of Loading | BOL, INV | BOL-005, XD-001 |
| Field 44F | Port of Discharge | BOL, INV | BOL-005, XD-001 |
| Field 44C | Latest Shipment Date | BOL | BOL-019, XD-002 |
| Field 45A | Goods Description | INV | INV-006, INV-007 |
| Field 46A | Documents Required | ALL | All doc-specific rules — read carefully |
| Field 47A | Additional Conditions | ALL | BC-001, WC-001 — custom conditions |
| Field 48 | Period for Presentation | ALL | GEN-005 — often overrides 21-day default |
| Field 50 | Applicant | INV, BOL | INV-002, INV-012, BOL-013 |
| Field 59 | Beneficiary | INV | INV-001, INV-013 |

---

## PART 12 — NOTES FOR AUTOMATED CHECKER IMPLEMENTATION

### Check Type Distribution
| Type | Description | Implementation |
|------|-------------|---------------|
| **A** | Deterministic — exact field match, numeric comparison, date logic | Java/Spring Boot code |
| **B** | Semantic — meaning equivalence, context-aware, tolerance judgment | LLM call (Type B check) |
| **C** | Holistic — complex multi-factor, edge cases, low confidence | Human review queue |

### Minimum Rule Set for V1 (Core Coverage)
Implement at minimum: INV-001 to INV-022, BOL-001 to BOL-019, PKL-002 to PKL-009,  
BOE-001 to BOE-014, XD-001 to XD-024, GEN-001 to GEN-015

### Document Registry Approach (Plug-and-Play)
Each document type maps to its rule subset in JSONL:
```
{"doc_type":"INVOICE","rules":["INV-001","INV-002",...],"cross_rules":["XD-001","XD-004",...]}
{"doc_type":"BILL_OF_LADING","rules":["BOL-001","BOL-002",...],"cross_rules":["XD-001","XD-006",...]}
{"doc_type":"PACKING_LIST","rules":["PKL-001","PKL-002",...],"cross_rules":["XD-004","XD-006",...]}
{"doc_type":"BILL_OF_EXCHANGE","rules":["BOE-001","BOE-002",...],"cross_rules":["XD-008","XD-010",...]}
{"doc_type":"BENEFICIARY_CERT","rules":["BC-001","BC-002",...],"cross_rules":["XD-011","XD-012",...]}
{"doc_type":"WARRANTY_CERT","rules":["WC-001","WC-002",...],"cross_rules":["XD-013","XD-014",...]}
{"doc_type":"INSURANCE","rules":["INS-001","INS-002",...],"cross_rules":["XD-015","XD-017",...]}
{"doc_type":"CERT_OF_ORIGIN","rules":["COO-001","COO-002",...],"cross_rules":["XD-018","XD-019",...]}
```

---

---

## APPENDIX — ISBP 821 Chapter Structure Quick Reference

| Chapter | Scope | Key Topics |
|---------|-------|-----------|
| Part A | Universal Principles | Compliance standard, 5-day exam, 21-day window, non-contradiction, originals, abbreviations, typos, date formats, corrections |
| Part B | Bills of Exchange | Drawer/drawee, tenor, maturity date calculation, on-board date as tenor start |
| Part C | Invoices | Issuer/applicant, currency, amount, goods description, unit price, Incoterms, LC no. reference |
| Part D | Transport Documents | On-board notation, carrier signature, port matching, full set originals, clean B/L, transhipment, consignee, freight notation |
| Part E | Insurance Documents | Issuer, coverage date ≤ shipment date, currency, 110% CIF minimum, risk coverage route |
| Part F | Certificates of Origin | Issuer, country of origin vs invoice, goods description conflict |
| Part H | Packing Lists & Weight Lists | Issuer, quantity/packages consistency, shipping marks, weight consistency, price prohibition |
| Part Q | Generic Certificate Principles | LC-driven content, issuer identity, timeframe precision, cross-reference accuracy |

---

*Basis: UCP 600 (ICC Publication No. 600, 2007) | ISBP 821 (ICC Publication No. 821E, 2023)*  
*For system use only — not a reproduction of ICC publications*
