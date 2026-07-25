// ===========================================================================
// lc-check — mock fixtures, built on the real presentation bundles.
//
// Each case is backed by an actual file from `test/cases/`: the credit is the
// real MT700 text, the presentation is the real 6-page PDF, and the page→document
// mapping comes from that bundle's manifest. Only the extractions, findings and
// run telemetry are authored.
//
// Cases carry their own run state, so a finished case opens with every finding
// already in place — Review and Decision are demonstrable without waiting on a
// run. Case 02 ships fresh so the live run is demonstrable too.
//
// Everything here is domain data: no colours, no formatted strings, no view
// state. Those are derived in the screens.
// ===========================================================================

import { SAMPLES, DOC_TYPES } from './samples/index.js'
import { parseMt700Lines, tagValue } from '../lib/mt700.js'
import { checkSpec, buildExecutionPlan } from './checkSpecs.js'

/** @typedef {import('./contracts.js').CaseDetail} CaseDetail */

// ---- Review areas ----------------------------------------------------------
// Stable across credits. Which *checks* run varies; which areas exist does not.

const AREAS = [
  { id: 'a1', name: 'Requirements', kind: 'domain', wave: 1, purpose: 'Settles what the credit calls for. Everything else is measured against this.' },
  { id: 'a2', name: 'Presentation & completeness', kind: 'domain', wave: 2, purpose: 'Every required document there, in the right originals, signed.' },
  { id: 'a3', name: 'Dates & shipment', kind: 'domain', wave: 2, purpose: 'On-board date, presentation period, expiry.' },
  { id: 'a4', name: 'Goods, amounts & tolerance', kind: 'domain', wave: 2, purpose: 'Description, quantity, price and drawn amount against the credit.' },
  { id: 'a5', name: 'General review', kind: 'main', wave: 3, purpose: 'Reads the whole set together the way a checker would — anything no single area owns.' },
  { id: 'a6', name: 'Sanctions & parties', kind: 'policy', wave: 2, purpose: 'Screens parties, vessel and ports. Run again at payment.' },
]

// ---- Check catalogue -------------------------------------------------------
//
// `appliesWhen` is the trigger: a predicate over the credit's tags, mirroring the
// backend's `triggers` (all_of / any_of over lc_field_present). A check whose
// trigger is false is recorded as not run, with the reason — never dropped.

const CHECK_CATALOG = [
  { id: 'REQ-46A', areaId: 'a1', name: 'Documents the credit calls for', ruleRef: 'UCP 600 art. 14(a)', because: (t) => `Field :46A: lists the documents required`, appliesWhen: (t) => !!t['46A'] },
  { id: 'REQ-31D', areaId: 'a1', name: 'Terms, dates and tolerances in force', ruleRef: 'UCP 600 art. 6, 30', because: () => 'Fields :31D: :39A: carry the expiry and tolerance', appliesWhen: (t) => !!t['31D'] },
  { id: 'REQ-40E', areaId: 'a1', name: 'Which rules apply (UCP 600, ISBP 821)', ruleRef: 'UCP 600 art. 1; ISBP 821', because: () => 'Field :40E: reads UCP LATEST VERSION', appliesWhen: (t) => !!t['40E'] },

  { id: 'DOCSET-14A', areaId: 'a2', name: 'All required documents presented', ruleRef: 'UCP 600 art. 14(a)', because: () => 'Documents named in :46A:', appliesWhen: (t) => !!t['46A'] },
  { id: 'DOCSET-17', areaId: 'a2', name: 'Originals and copies as called for', ruleRef: 'UCP 600 art. 17', because: () => ':46A: states how many originals and copies of each document', appliesWhen: (t) => !!t['46A'] },
  { id: 'DOCSET-03', areaId: 'a2', name: 'Signed where a signature is required', ruleRef: 'UCP 600 art. 3, 18', because: () => 'The invoice and the certificates must be signed', appliesWhen: (t) => !!t['46A'] },
  { id: 'DOCSET-A31', areaId: 'a2', name: 'No documents beyond those called for', ruleRef: 'ISBP 821 A31', because: () => 'Documents not required by the credit are disregarded or returned', appliesWhen: (t) => !!t['46A'] },

  { id: 'DATE-44C', areaId: 'a3', name: 'Shipment on or before the latest date', ruleRef: 'UCP 600 art. 14(c)', because: (t) => `Field :44C: sets the latest shipment date (${t['44C'] || '—'})`, appliesWhen: (t) => !!t['44C'] },
  { id: 'DATE-48', areaId: 'a3', name: 'Presented within the presentation period', ruleRef: 'UCP 600 art. 14(c)', because: (t) => `Field :48: allows ${t['48'] || '21 days'}`, appliesWhen: (t) => !!t['48'] },
  { id: 'DATE-31D', areaId: 'a3', name: 'Presented before expiry', ruleRef: 'UCP 600 art. 6(d)', because: (t) => `Field :31D: expires ${t['31D'] || '—'}`, appliesWhen: (t) => !!t['31D'] },

  { id: 'GOODS-18C', areaId: 'a4', name: 'Goods description corresponds', ruleRef: 'UCP 600 art. 18(c); ISBP 821 C3', because: () => 'Field :45A: describes the goods', appliesWhen: (t) => !!t['45A'] },
  { id: 'AMT-30A', areaId: 'a4', name: 'Amount within tolerance', ruleRef: 'UCP 600 art. 30(a)', because: (t) => `Fields :32B: :39A: allow ${t['39A'] ? `±${t['39A'].split('/')[0]}%` : 'no tolerance'}`, appliesWhen: (t) => !!t['32B'] },
  { id: 'AMT-C6', areaId: 'a4', name: 'Quantity and unit price agree', ruleRef: 'ISBP 821 C6', because: () => 'Field :45A: states the quantity and unit price', appliesWhen: (t) => !!t['45A'] },

  { id: 'TRANS-20', areaId: 'a5', name: 'Transport document form and endorsement', ruleRef: 'UCP 600 art. 20', because: () => 'A transport document is in the presentation', appliesWhen: () => true },
  { id: 'TRANS-43P', areaId: 'a5', name: 'Partial shipments as permitted', ruleRef: 'UCP 600 art. 31', because: (t) => `Field :43P: reads ${t['43P'] || 'silent'}`, appliesWhen: (t) => !!t['43P'] },
  { id: 'TRANS-43T', areaId: 'a5', name: 'Transhipment as permitted', ruleRef: 'UCP 600 art. 20(c)', because: (t) => `Field :43T: reads ${t['43T'] || 'silent'}`, appliesWhen: (t) => !!t['43T'] },
  { id: 'COND-47A', areaId: 'a5', name: 'Additional conditions satisfied', ruleRef: 'UCP 600 art. 14(d)', because: () => 'Field :47A: carries free-text conditions', appliesWhen: (t) => !!t['47A'] },
  { id: 'XD-A23', areaId: 'a5', name: 'Cross-document consistency', ruleRef: 'ISBP 821 A23', because: () => 'Data across the set must not conflict', appliesWhen: () => true },
  { id: 'GEN-01', areaId: 'a5', name: 'Anything else a checker would query', ruleRef: 'Bank practice', because: () => 'No single area owns this — the main agent reads the whole set', appliesWhen: () => true },

  { id: 'PARTY-FC04', areaId: 'a6', name: 'Parties, vessel and ports screened', ruleRef: 'Internal policy FC-04', because: () => 'Financial-crime policy, every presentation', appliesWhen: () => true },

  // Never triggered by these three credits, kept to show what was not run.
  { id: 'TRANS-22', areaId: 'a5', name: 'Charter-party bill of lading', ruleRef: 'UCP 600 art. 22', because: () => 'Nothing in :46A: or :47A: mentions a charter-party bill of lading', appliesWhen: () => false },
  { id: 'CERT-28', areaId: 'a5', name: 'Insurance cover and clauses', ruleRef: 'UCP 600 art. 28', because: () => 'This credit does not call for an insurance document', appliesWhen: (t) => /INSURANCE/i.test(t['46A'] || '') },
]

// ---- Run telemetry ---------------------------------------------------------

// A run is not one model. Vision extraction, planning and rule execution have
// different jobs, different context sizes and very different prices, so cost has
// to be attributed per model or the total tells you nothing you can act on.
//
// Mirrors the v3 service's split: a VLM reads the pages, a cheap text model
// plans and routes, the main model executes the rules.
export const MODELS = {
  'qwen3-vl-8b': {
    id: 'qwen3-vl-8b',
    label: 'Qwen3-VL 8B',
    role: 'Vision · page extraction',
    inPerMillion: 0.18,
    outPerMillion: 0.72,
    host: 'Ollama · on-premise',
  },
  'qwen3-32b': {
    id: 'qwen3-32b',
    label: 'Qwen3 32B',
    role: 'Planner · routing',
    inPerMillion: 0.4,
    outPerMillion: 1.2,
    host: 'DashScope',
  },
  'claude-sonnet-4-5': {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    role: 'Main · rule execution',
    inPerMillion: 3.0,
    outPerMillion: 15.0,
    host: 'Anthropic',
  },
}

/** @deprecated kept so older callers keep resolving; use MODELS. */
export const TOKEN_RATES = { inPerMillion: 3.0, outPerMillion: 15.0 }

const RUN_STEPS = [
  { id: 'r1', name: 'Read & segment the file', role: 'intake · OCR + layout', model: 'qwen3-vl-8b', calls: 6, seconds: 5.4, tokensIn: 38000, tokensOut: 3100, cachePct: 0, retries: 0 },
  { id: 'r2', name: 'Plan the review', role: 'planner · picks areas & order', model: 'qwen3-32b', calls: 1, seconds: 1.7, tokensIn: 11000, tokensOut: 1700, cachePct: 0, retries: 0 },
  { id: 'r3', name: 'Run the plan', role: 'driver · sequencing, retries, merge', model: 'qwen3-32b', calls: 3, seconds: 2.1, tokensIn: 14000, tokensOut: 2200, cachePct: 71, retries: 0 },
  { id: 'r4', name: 'Requirements', role: 'review agent', model: 'claude-sonnet-4-5', calls: 3, seconds: 2.8, tokensIn: 26000, tokensOut: 3200, cachePct: 14, retries: 0 },
  { id: 'r5', name: 'Presentation & completeness', role: 'review agent', model: 'claude-sonnet-4-5', calls: 4, seconds: 4.6, tokensIn: 51000, tokensOut: 5400, cachePct: 46, retries: 1 },
  { id: 'r6', name: 'Dates & shipment', role: 'review agent', model: 'claude-sonnet-4-5', calls: 3, seconds: 2.2, tokensIn: 21000, tokensOut: 2100, cachePct: 63, retries: 0 },
  { id: 'r7', name: 'Goods, amounts & tolerance', role: 'review agent', model: 'claude-sonnet-4-5', calls: 3, seconds: 3.1, tokensIn: 33000, tokensOut: 3600, cachePct: 55, retries: 0 },
  { id: 'r8', name: 'General review', role: 'review agent', model: 'claude-sonnet-4-5', calls: 6, seconds: 7.4, tokensIn: 96000, tokensOut: 9700, cachePct: 42, retries: 1 },
  { id: 'r9', name: 'Sanctions & parties', role: 'review agent', model: 'qwen3-32b', calls: 1, seconds: 1.1, tokensIn: 12000, tokensOut: 800, cachePct: 68, retries: 0 },
]

const ALL_AREA_IDS = AREAS.map((a) => a.id)

// ---- Per-case authoring ----------------------------------------------------
//
// `docs` keys are manifest doc-type codes. `facts` anchor to a bundle page for
// presented documents and to an MT700 tag id for the credit.

const CASE_01 = {
  sample: '01',
  applicantShort: 'Sino Imports Co Ltd',
  beneficiaryShort: 'Widget Exports Pte Ltd',
  presentedDate: '28 Jan 2025',
  presentingBank: 'OCBC Singapore · OCBC/25/1187',
  authoriser: 'R. Meijer',
  docRefs: {
    INV: 'WE-2025-0041',
    BOL: 'MSCU-4471902',
    PKL: 'PL-25-0041',
    BOE: 'BOE-25-0041',
    BC: 'BC-25-0041',
    WC: 'WC-25-0041',
  },
  lowConfidence: ['BOE'],
  scanNotes: {
    BOE: 'The lower half of the bill of exchange is faint and the drawee block is partly cut off. We read what we could — check the original before relying on it.',
  },
  // Checks the planner added for this credit that are not in the dictionary.
  // The planner reads :47A: and writes a check per condition it finds, so a
  // credit with bespoke wording still gets examined clause by clause.
  plannerChecks: [
    {
      id: 'COND-47A.1',
      areaId: 'a5',
      name: 'Invoice quotes contract no. WIDG-PO-2024-0317',
      appliesBecause: 'Planner read condition 1 of :47A: and wrote a check for it',
      ruleRef: 'UCP 600 art. 14(d)',
      rule: 'The commercial invoice must quote contract no. WIDG-PO-2024-0317, in addition to the LC number.\n\nA reference that is absent is a discrepancy, not a formality.\n\nFields to look at: {47A}',
      refs: ['UCP600 Art.14'],
      severity: 'CRITICAL',
      findingId: 'f-cond',
    },
    {
      id: 'COND-47A.2',
      areaId: 'a5',
      name: 'Every document bears the LC number',
      appliesBecause: 'Planner read condition 2 of :47A: and wrote a check for it',
      ruleRef: 'UCP 600 art. 14(d)',
      rule: 'Each document presented must bear the LC number.\n\nCheck every document in scope, not only the invoice.\n\nFields to look at: {47A}, {20}',
      refs: ['UCP600 Art.14'],
      severity: 'MAJOR',
      findingId: null,
    },
    {
      id: 'COND-47A.3',
      areaId: null,
      name: 'All documents are in English',
      appliesBecause: 'Planner read condition 3 of :47A: but no rule in the dictionary covers document language',
      ruleRef: 'No rule defined',
      rule: 'All documents must be in English.\n\nNo check in the dictionary tests document language, so this condition was not examined. It is surfaced for a person to read.\n\nFields to look at: {47A}',
      refs: [],
      severity: 'MAJOR',
      findingId: 'm-lang',
      notCovered: true,
    },
  ],
  creditFacts: [
    { tag: '20', label: 'Credit number' },
    { tag: '32B', label: 'Amount', extra: '±10% (:39A: 10/10)' },
    { tag: '44C', label: 'Latest shipment' },
    { tag: '31D', label: 'Expiry' },
    { tag: '45A', label: 'Goods' },
    { tag: '46A', label: 'Documents required' },
    { tag: '47A', label: 'Additional conditions', flag: 'One condition has no rule behind it' },
    { tag: '43P', label: 'Partial shipments' },
    { tag: '43T', label: 'Transhipment' },
    { tag: '48', label: 'Presentation period' },
  ],
  docFacts: {
    INV: [
      { page: 1, label: 'Invoice number', value: 'WE-2025-0041 · 20 Jan 2025' },
      { page: 1, label: 'Goods', value: 'Industrial widgets model IW-2024' },
      { page: 1, label: 'Quantity', value: '500 units at USD 112.00' },
      { page: 1, label: 'Total', value: 'USD 56,000.00' },
      { page: 1, label: 'Terms', value: 'FOB Port Klang' },
      { page: 1, label: 'LC number quoted', value: 'LCWIDG-2024-0317', src: 'Under L/C No. LCWIDG-2024-0317' },
      { page: 1, label: 'Contract number quoted', value: 'Not present', conf: 'MED', flag: 'Required by :47A: — searched the whole page', src: '[no contract reference found on this page]' },
    ],
    BOL: [
      { page: 2, label: 'B/L number', value: 'MSCU-4471902' },
      { page: 2, label: 'On board', value: '14 Jan 2025', src: 'SHIPPED ON BOARD 14 JAN 2025', flag: 'After the latest shipment date' },
      { page: 2, label: 'Loading / discharge', value: 'Port Klang → Singapore' },
      { page: 2, label: 'Transhipment', value: 'Transhipped at Singapore', conf: 'MED', src: 'Transhipment at SINGAPORE', flag: 'Credit says NOT ALLOWED' },
      { page: 2, label: 'Freight', value: 'Freight collect' },
    ],
    PKL: [
      { page: 3, label: 'Packing', value: '498 cartons', src: '498 CARTONS', flag: 'Invoice states 500 units' },
      { page: 3, label: 'Gross weight', value: '6,240 kg' },
      { page: 3, label: 'Marks', value: 'WE/0041/SINGAPORE' },
    ],
    BOE: [
      { page: 4, label: 'Draft', value: 'BOE-25-0041 · at sight' },
      { page: 4, label: 'Amount', value: 'USD 56,000.00' },
      { page: 4, label: 'Drawee', value: 'Present but not legible', conf: 'LOW', src: '[ ? ? ? ]', flag: 'Faint scan — check the original' },
    ],
    BC: [
      { page: 5, label: 'Certificate', value: 'BC-25-0041 · 20 Jan 2025' },
      { page: 5, label: 'Origin statement', value: 'Goods are of Singapore origin' },
      { page: 5, label: 'Inspection statement', value: 'Not present', conf: 'MED', src: 'We certify the goods are of Singapore origin.', flag: ':46A: also requires a pre-shipment inspection statement' },
    ],
    WC: [
      { page: 6, label: 'Certificate', value: 'WC-25-0041 · 12 months from shipment' },
      { page: 6, label: 'Called for by the credit', value: 'No', flag: 'Not listed in :46A:' },
    ],
  },
  findings: [
    {
      id: 'f-date', severity: 'discrepancy', area: 'Shipment terms', areaId: 'a3', checkId: 'DATE-44C',
      docId: 'BOL', page: 2, creditTag: '44C',
      statement: 'LATE SHIPMENT — B/L ON BOARD 14 JAN 2025, CREDIT REQUIRES SHIPMENT NOT LATER THAN 31 DEC 2024',
      title: 'Shipment is two weeks later than the credit allows',
      detail: 'The bill of lading is dated on board 14 January 2025. The credit’s last day for shipment was 31 December 2024, so as presented this cannot be taken up without the applicant’s agreement.',
      expected: ':44C: 241231\n(latest shipment 31 DEC 2024)',
      quote: 'SHIPPED ON BOARD\n14 JAN 2025',
      quoteSource: 'Bill of lading, p.2',
      reason: 'UCP 600 article 14(c) with field 44C — a presentation showing shipment after the latest shipment date is discrepant regardless of when the documents were presented. Only the applicant can waive it.',
      analysis: {
        requirement: 'Field 44C fixes 31 December 2024 as the last day for shipment. UCP 600 article 14(c) makes the on-board notation on the transport document the governing date — not the date the bill of lading was issued, and not the date documents were presented.',
        presented: 'The bill of lading carries an on-board notation of 14 January 2025. That is 14 days after the last permitted day. No other document in the presentation contradicts it, and the packing list and invoice dates are consistent with a January shipment.',
        why: 'A shipment date that has passed cannot be corrected by anything in the presentation. Replacing the bill of lading would not help — the goods went on board when they went on board. This is a hard discrepancy on the face of the documents.',
        options: [
          'Refuse the presentation and hold the documents at the presenter\'s disposal — a refusal notice is due within five banking days of presentation.',
          'Approach the applicant for a waiver. This is the usual route when the goods have already sailed; payment follows once the applicant agrees in writing.',
        ],
        confidence: 'HIGH',
      },
      trace: [{ key: 'read by', value: 'Dates & shipment review' }, { key: 'source', value: 'bundle p.2' }, { key: 'basis', value: 'UCP600 art.14(c), field 44C' }],
    },
    {
      id: 'f-cond', severity: 'discrepancy', area: 'Additional conditions', areaId: 'a5', checkId: 'COND-47A',
      docId: 'INV', page: 1, creditTag: '47A',
      statement: 'INVOICE DOES NOT QUOTE CONTRACT NO. WIDG-PO-2024-0317 AS REQUIRED BY FIELD 47A',
      title: 'The invoice does not quote the contract number the credit requires',
      detail: 'Field 47A requires the invoice to quote both the LC number and contract no. WIDG-PO-2024-0317. The invoice quotes the LC number only.',
      expected: ':47A: INVOICE MUST QUOTE LC NUMBER\nAND CONTRACT NO. WIDG-PO-2024-0317',
      quote: 'Under L/C No. LCWIDG-2024-0317\n[no contract number]',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 14(d) — data in a document must not conflict with the credit, and an express condition of the credit must be met. A missing required reference is a discrepancy, not a formality.',
      analysis: {
        requirement: 'Condition 1 of field 47A requires the invoice to quote both the LC number and contract no. WIDG-PO-2024-0317. The planner wrote a check for this clause because the dictionary has no standing rule for contract references.',
        presented: 'The invoice quotes the LC number. Searching the full page found no contract number, in any format — not in the header, the body, or the footer.',
        why: 'UCP 600 article 14(d) requires data in a document not to conflict with the credit, and an express condition of the credit must be satisfied. A required reference that is absent is a discrepancy, however clerical it looks.',
        options: [
          'Return the invoice to the presenter to be reissued quoting the contract number. This is normally cured within the presentation period if time remains.',
          'Raise it alongside the shipment-date discrepancy in a single refusal notice.',
        ],
        confidence: 'MED',
      },
      trace: [{ key: 'read by', value: 'General review · conditions agent' }, { key: 'source', value: 'bundle p.1' }, { key: 'basis', value: 'UCP600 art.14(d); field 47A' }],
    },
    {
      id: 'f-trans', severity: 'discrepancy', area: 'Transhipment', areaId: 'a5', checkId: 'TRANS-43T',
      docId: 'BOL', page: 2, creditTag: '43T',
      statement: 'B/L SHOWS TRANSHIPMENT AT SINGAPORE, CREDIT PROHIBITS TRANSHIPMENT (FIELD 43T)',
      title: 'The bill of lading shows transhipment, which the credit forbids',
      detail: 'The B/L records a transhipment at Singapore. Field 43T reads NOT ALLOWED.',
      expected: ':43T: NOT ALLOWED',
      quote: 'Transhipment at SINGAPORE',
      quoteSource: 'Bill of lading, p.2',
      reason: 'UCP 600 article 20(c) — where the credit prohibits transhipment, a transport document indicating it will take place is discrepant, unless the goods are shipped in a container and the B/L covers the whole carriage.',
      analysis: {
        requirement: 'Field 43T reads NOT ALLOWED. Under UCP 600 article 20(c), a bill of lading indicating that transhipment will or may take place is discrepant when the credit prohibits it.',
        presented: 'The bill of lading records a transhipment at Singapore, on the Port Klang to Singapore routing.',
        why: 'The article carries one exception: transhipment is acceptable despite a prohibition if the goods are shipped in a container and the same bill of lading covers the entire carriage. The document does not state container shipment, so the exception cannot be relied on as presented.',
        options: [
          'Check the original for a container number or an FCL notation — if the goods moved in a container under a through bill, the exception applies and this is not a discrepancy.',
          'If there is no container evidence, raise it with the other two.',
        ],
        confidence: 'MED',
      },
      trace: [{ key: 'read by', value: 'General review' }, { key: 'source', value: 'bundle p.2' }, { key: 'basis', value: 'UCP600 art.20(c); field 43T' }],
    },
    {
      id: 'f-cert', severity: 'possible', area: 'Certificates', areaId: 'a2', checkId: 'DOCSET-14A',
      docId: 'BC', page: 5, creditTag: '46A',
      statement: 'BENEFICIARY\'S CERTIFICATE DOES NOT STATE PRE-SHIPMENT INSPECTION AS REQUIRED BY FIELD 46A',
      title: 'The beneficiary’s certificate is silent on pre-shipment inspection',
      detail: 'The credit asks the certificate to state both Singapore origin and that the goods were inspected prior to shipment. It states origin only. Worth reading the original — the wording may be on the reverse.',
      expected: "BENEFICIARY'S CERTIFICATE STATING GOODS\nARE OF SINGAPORE ORIGIN AND HAVE BEEN\nINSPECTED PRIOR TO SHIPMENT",
      quote: 'We certify the goods are of\nSingapore origin.',
      quoteSource: "Beneficiary's certificate, p.5",
      reason: 'UCP 600 article 14(f) — where a credit requires a document to state something, that statement must appear. We flag rather than call it because only one of the two required statements is missing.',
      analysis: {
        requirement: 'Field 46A asks the beneficiary\'s certificate to state two things: that the goods are of Singapore origin, and that they were inspected prior to shipment.',
        presented: 'The certificate states Singapore origin. It says nothing about inspection on the page we read.',
        why: 'UCP 600 article 14(f) requires a required statement to appear. One of two statements is missing, which would ordinarily be a discrepancy — but a short certificate often carries wording on the reverse, and we only had the front.',
        options: [
          'Look at the reverse of the original before deciding. If the inspection wording is there, this closes.',
          'If it is genuinely absent, raise it — the certificate does not do what the credit asked of it.',
        ],
        confidence: 'MED',
      },
      trace: [{ key: 'read by', value: 'Presentation & completeness review' }, { key: 'source', value: 'bundle p.5' }, { key: 'basis', value: 'UCP600 art.14(f); field 46A' }],
    },
    {
      id: 'f-extra', severity: 'possible', area: 'Document set', areaId: 'a2', checkId: 'DOCSET-A31',
      docId: 'WC', page: 6, creditTag: '46A',
      statement: 'WARRANTY CERTIFICATE PRESENTED BUT NOT CALLED FOR BY THE CREDIT — DISREGARDED',
      title: 'A warranty certificate was presented that the credit does not call for',
      detail: 'Field 46A lists three documents; a warranty certificate is not among them. Extra documents are not a discrepancy in themselves, but they are not examined and should be returned or ignored.',
      expected: ':46A: invoice, packing list,\nbeneficiary’s certificate',
      quote: 'WARRANTY CERTIFICATE WC-25-0041',
      quoteSource: 'Warranty certificate, p.6',
      reason: 'ISBP 821 paragraph A31 — a document presented but not required by the credit may be disregarded and returned to the presenter. It must not be examined as if it were required.',
      analysis: {
        requirement: 'Field 46A names three documents: invoice, packing list, and beneficiary\'s certificate. A warranty certificate is not among them.',
        presented: 'A warranty certificate was presented as page 6 of the bundle.',
        why: 'ISBP 821 paragraph A31 says a document presented but not required by the credit may be disregarded and returned. It is not a discrepancy — but it must not be examined either, because raising a defect against a document the credit never asked for is a mistake checkers get criticised for.',
        options: [
          'Ignore it and note on the file that it was returned or disregarded.',
          'Return it to the presenter with the other documents if the presentation is refused.',
        ],
        confidence: 'HIGH',
      },
      trace: [{ key: 'read by', value: 'Presentation & completeness review' }, { key: 'source', value: 'bundle p.6' }, { key: 'basis', value: 'ISBP821 A31' }],
    },
    {
      id: 'f-qty', severity: 'possible', area: 'Consistency', areaId: 'a5', checkId: 'XD-A23',
      docId: 'PKL', page: 3, creditTag: '45A',
      statement: 'QUANTITY CONFLICT — PACKING LIST 498 CARTONS AGAINST INVOICE 500 UNITS',
      title: 'The packing list shows 498 cartons against 500 units on the invoice',
      detail: 'Two units short, or two units to a carton somewhere in the packing — either way the two documents do not agree, and a checker will be asked which is right.',
      expected: 'Commercial invoice:\n500 UNITS AT USD112.00',
      quote: 'Packing list:\n498 CARTONS',
      quoteSource: 'Packing list, p.3',
      reason: 'ISBP 821 paragraph A23 — data in one document need not repeat another exactly, but must not conflict. A quantity difference between invoice and packing list is a conflict.',
      analysis: {
        requirement: 'ISBP 821 paragraph A23: data in one document need not repeat another exactly, but must not conflict with it.',
        presented: 'The invoice states 500 units. The packing list states 498 cartons. The credit describes 500 units at USD 112.00.',
        why: 'Units and cartons are not the same measure, so this may be a packing arrangement rather than a shortfall — but nothing in the set reconciles the two figures, and the invoice was drawn for the full 500 units. A checker will be asked which number is right.',
        options: [
          'Ask the presenter to reconcile the packing list against the invoice.',
          'If the goods genuinely are 498 units, the invoice amount is overstated and the drawing needs revisiting against the tolerance.',
        ],
        confidence: 'MED',
      },
      trace: [{ key: 'read by', value: 'General review' }, { key: 'source', value: 'bundle p.1, p.3' }, { key: 'basis', value: 'ISBP821 A23' }],
    },
    {
      id: 'f-amt', severity: 'clean', area: 'Amount', areaId: 'a4', checkId: 'AMT-30A',
      docId: 'INV', page: 1, creditTag: '32B',
      statement: 'AMOUNT DRAWN USD 56,000.00 WITHIN CREDIT AMOUNT USD 60,000.00 LESS 10 PCT TOLERANCE',
      title: 'Amount drawn is within the 10% tolerance',
      detail: 'Invoice total USD 56,000.00 against a credit amount of USD 60,000.00 with ±10% allowed — the permitted range is USD 54,000.00 to USD 66,000.00.',
      expected: ':32B: USD60000,00\n:39A: 10/10',
      quote: 'Total: USD 56,000.00',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 30(a) — the drawn amount is inside the stated tolerance.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'basis', value: 'UCP600 art.30(a)' }],
    },
    {
      id: 'f-goods', severity: 'clean', area: 'Goods description', areaId: 'a4', checkId: 'GOODS-18C',
      docId: 'INV', page: 1, creditTag: '45A',
      statement: 'GOODS DESCRIPTION ON INVOICE CORRESPONDS WITH FIELD 45A',
      title: 'Goods description on the invoice corresponds with the credit',
      detail: 'Model designation IW-2024, quantity, unit price and FOB Port Klang all appear as the credit states them.',
      expected: 'INDUSTRIAL WIDGETS MODEL IW-2024\n500 UNITS AT USD112.00 PER UNIT\nFOB PORT KLANG',
      quote: 'INDUSTRIAL WIDGETS MODEL IW-2024\n500 UNITS AT USD 112.00 / UNIT\nFOB PORT KLANG',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 18(c) — the description in the invoice corresponds with that in the credit.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'basis', value: 'UCP600 art.18(c)' }],
    },
    {
      id: 'f-pres', severity: 'clean', area: 'Presentation', areaId: 'a3', checkId: 'DATE-48',
      docId: 'INV', page: 1, creditTag: '48',
      statement: 'PRESENTED 28 JAN 2025, WITHIN 21 DAYS OF SHIPMENT AND BEFORE EXPIRY 31 DEC 2025',
      title: 'Presented in time — 14 days after shipment, well before expiry',
      detail: 'Documents were presented 28 January 2025 against a 21-day presentation period and an expiry of 31 December 2025 in Singapore.',
      expected: ':48: 21/DAYS\n:31D: 251231SINGAPORE',
      quote: 'Presented 28 JAN 2025 (day 14)',
      quoteSource: 'Presentation record',
      reason: 'UCP 600 articles 6(d) and 14(c) — within both the presentation period and the expiry date.',
      trace: [{ key: 'read by', value: 'Dates & shipment review' }, { key: 'basis', value: 'UCP600 art.6(d), 14(c)' }],
    },
    {
      id: 'f-orig', severity: 'clean', area: 'Document set', areaId: 'a2', checkId: 'DOCSET-17',
      docId: 'INV', page: 1, creditTag: '46A',
      statement: 'INVOICE PRESENTED IN ONE ORIGINAL AND THREE COPIES AS REQUIRED',
      title: 'Invoice presented in one original and three copies as required',
      detail: 'The credit calls for one original and three copies quoting the LC number; that is what was presented.',
      expected: 'COMMERCIAL INVOICE IN ONE ORIGINAL\nAND THREE COPIES, QUOTING LC NUMBER',
      quote: 'Invoice 1/3 — original plus three copies',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 17 — originals and copies as stipulated.',
      trace: [{ key: 'read by', value: 'Presentation & completeness review' }, { key: 'basis', value: 'UCP600 art.17' }],
    },
    {
      id: 'f-party', severity: 'clean', area: 'Parties', areaId: 'a6', checkId: 'PARTY-FC04',
      docId: 'mt700', creditTag: '59',
      statement: 'PARTIES, VESSEL AND PORTS SCREENED — NO MATCHES',
      title: 'Parties and vessel screened — nothing to report',
      detail: 'Applicant, beneficiary, carrier, vessel and both ports screened against the current lists. No matches.',
      expected: 'Sanctions & parties screening',
      quote: 'No matches — screened 28 JAN 2025',
      quoteSource: 'Screening record',
      reason: 'Internal financial-crime policy. Re-screened at the point of payment as well.',
      trace: [{ key: 'read by', value: 'Sanctions & parties screening' }, { key: 'lists', value: 'refreshed 28 JAN 2025 06:00 SGT' }],
    },
    {
      id: 'm-lang', severity: 'manual', area: 'No rule yet', areaId: null, checkId: null,
      docId: 'mt700', creditTag: '47A',
      statement: 'NOT CHECKED — FIELD 47A REQUIRES ALL DOCUMENTS IN ENGLISH, NO RULE DEFINED',
      title: 'A condition about document language has no rule behind it',
      detail: 'Field 47A requires all documents to be in English. Nothing in the checks dictionary covers document language, so no check ran on it. Read it yourself — we have asked the dictionary team to add a rule.',
      expected: ':47A: ALL DOCUMENTS MUST BE IN ENGLISH',
      quote: 'Not checked — no rule defined',
      quoteSource: 'MT700, field 47A',
      reason: 'We only claim what we checked. Conditions with no rule are surfaced rather than passed silently.',
      analysis: {
        requirement: 'Condition 3 of field 47A requires all documents to be in English.',
        presented: 'Not examined. No check in the dictionary tests document language, so nothing ran against this condition.',
        why: 'We report what we did not check rather than letting it pass silently. A condition with no rule behind it is not a pass — it is an open question, and it is yours.',
        options: [
          'Read the documents yourself and satisfy the condition by eye.',
          'Dictionary request DR-2291 has been raised to add a language rule.',
        ],
        confidence: 'LOW',
      },
      trace: [{ key: 'status', value: 'no rule in dictionary' }, { key: 'raised', value: 'dictionary request DR-2291' }],
    },
    {
      id: 'm-partial', severity: 'manual', area: 'Not reliable yet', areaId: null, checkId: 'TRANS-43P',
      docId: 'BOL', page: 2, creditTag: '43P',
      statement: 'NOT RELIED ON — PARTIAL SHIPMENT WORDING BELOW OUR AGREEMENT THRESHOLD',
      title: 'Partial-shipment wording — we do not check this well enough to rely on',
      detail: 'Our transport agent scores below the threshold we accept on partial-shipment wording, so this one always comes to you.',
      expected: ':43P: NOT ALLOWED',
      quote: 'Ran, but held back as unreliable',
      quoteSource: 'Bill of lading, p.2',
      reason: 'Checks below 90% agreement with checkers are never presented as conclusions.',
      analysis: {
        requirement: 'Field 43P reads NOT ALLOWED, so the presentation must not show partial shipment.',
        presented: 'The check ran and formed a view, but that view is withheld.',
        why: 'Our transport agent agrees with checkers on partial-shipment wording only 73% of the time over the last 90 days, below the 90% floor at which we are willing to state a conclusion. Presenting a coin-flip as an answer is worse than saying nothing.',
        options: [
          'Read the bill of lading for partial-shipment wording yourself.',
        ],
        confidence: 'LOW',
      },
      trace: [{ key: 'agreement', value: '73% over the last 90 days' }, { key: 'policy', value: 'below 90% — human decides' }],
    },
    {
      id: 'm-ocr', severity: 'manual', area: 'Low confidence', areaId: null, checkId: 'DOCSET-03',
      docId: 'BOE', page: 4, creditTag: '46A',
      statement: 'NOT CHECKED — DRAWEE BLOCK ON BILL OF EXCHANGE COULD NOT BE READ',
      title: 'The drawee block on the bill of exchange could not be read',
      detail: 'The lower half of page 4 is too faint to read. The signature check ran on what was legible, so treat the conclusion on this document as partial until you have looked.',
      expected: 'Signed where a signature is required',
      quote: 'Drawee block unread — scan quality',
      quoteSource: 'Bill of exchange, p.4',
      reason: 'Where evidence is missing we say so instead of inferring.',
      analysis: {
        requirement: 'A document must be signed where a signature is required, and the drawee must be identifiable on a draft.',
        presented: 'The drawee block on page 4 could not be read. OCR confidence was 0.41 against a floor of 0.60.',
        why: 'Where the evidence is missing we say so instead of inferring. The signature check ran on what was legible, so any conclusion about this document is partial.',
        options: [
          'Look at the original bill of exchange and confirm the drawee.',
          'Request a clean copy from the presenter if the original is no better.',
        ],
        confidence: 'LOW',
      },
      trace: [{ key: 'ocr', value: '0.41 — below our 0.60 floor' }, { key: 'effect', value: 'DOCSET-03 partial' }],
    },
  ],
}

const CASE_02 = {
  sample: '02',
  applicantShort: 'Desports GmbH',
  beneficiaryShort: 'Acme Apparel Co Ltd',
  presentedDate: '18 Nov 2025',
  presentingBank: 'Citibank New York · CITI/25/4410',
  authoriser: 'R. Meijer',
  docRefs: { INV: 'AA-2025-1187', BOL: 'HLCU-2298104', PKL: 'PL-25-1187', BOE: 'BOE-25-1187', BC: 'BC-25-1187', WC: 'WC-25-1187' },
  lowConfidence: [],
  scanNotes: {},
  creditFacts: [
    { tag: '20', label: 'Credit number' },
    { tag: '32B', label: 'Amount', extra: '±10% (:39A: 10/10)' },
    { tag: '31D', label: 'Expiry' },
    { tag: '45A', label: 'Goods' },
    { tag: '46A', label: 'Documents required' },
    { tag: '47A', label: 'Additional conditions' },
    { tag: '43P', label: 'Partial shipments' },
    { tag: '43T', label: 'Transhipment' },
    { tag: '48', label: 'Presentation period' },
  ],
  docFacts: {
    INV: [
      { page: 1, label: 'Invoice number', value: 'AA-2025-1187 · 10 Nov 2025' },
      { page: 1, label: 'Goods', value: 'T-shirts and shorts, cotton 100%' },
      { page: 1, label: 'Quantity', value: '5,000 units at USD 10.00' },
      { page: 1, label: 'Total', value: 'USD 50,000.00' },
      { page: 1, label: 'Contract number quoted', value: 'APP-PO-2025-1110' },
    ],
    BOL: [
      { page: 2, label: 'B/L number', value: 'HLCU-2298104' },
      { page: 2, label: 'On board', value: '8 Nov 2025' },
      { page: 2, label: 'Freight', value: 'Freight prepaid' },
    ],
    PKL: [
      { page: 3, label: 'Packing', value: '250 cartons, 20 units each' },
      { page: 3, label: 'Gross weight', value: '3,100 kg' },
    ],
    BOE: [
      { page: 4, label: 'Draft', value: 'BOE-25-1187 · at sight' },
      { page: 4, label: 'Amount', value: 'USD 50,000.00' },
    ],
    BC: [
      { page: 5, label: 'Certificate', value: 'BC-25-1187 · 10 Nov 2025' },
      { page: 5, label: 'Composition statement', value: 'Cotton 100%, silk trim on collar', src: 'Cotton 100 PCT with silk trim on collar', flag: 'Credit describes cotton 100% only' },
    ],
    WC: [
      { page: 6, label: 'Certificate', value: 'WC-25-1187' },
      { page: 6, label: 'Called for by the credit', value: 'No', flag: 'Not listed in :46A:' },
    ],
  },
  findings: [
    {
      id: 'f-comp', severity: 'discrepancy', area: 'Goods description', areaId: 'a4', checkId: 'GOODS-18C',
      docId: 'BC', page: 5, creditTag: '45A',
      statement: 'GOODS DESCRIPTION CONFLICT — CERTIFICATE STATES SILK TRIM, CREDIT STATES COTTON 100 PCT',
      title: 'The certificate describes a silk trim the credit does not mention',
      detail: 'The credit describes the goods as cotton 100%. The beneficiary’s certificate adds a silk trim on the collar — a description that conflicts with the credit rather than merely adding detail.',
      expected: 'T-SHIRTS AND SHORTS, COTTON 100PCT',
      quote: 'Cotton 100 PCT with silk trim\non collar',
      quoteSource: "Beneficiary's certificate, p.5",
      reason: 'UCP 600 article 14(d) — data in a document must not conflict with data in the credit. "Cotton 100%" and "with silk trim" cannot both be true of the same garment.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'source', value: 'bundle p.5' }, { key: 'basis', value: 'UCP600 art.14(d)' }],
    },
    {
      id: 'f-extra2', severity: 'possible', area: 'Document set', areaId: 'a2', checkId: 'DOCSET-A31',
      docId: 'WC', page: 6, creditTag: '46A',
      statement: 'WARRANTY CERTIFICATE PRESENTED BUT NOT CALLED FOR BY THE CREDIT — DISREGARDED',
      title: 'A warranty certificate was presented that the credit does not call for',
      detail: 'Not listed in field 46A. Extra documents are not examined and should be returned or ignored.',
      expected: ':46A: invoice, packing list,\nbeneficiary’s certificate',
      quote: 'WARRANTY CERTIFICATE WC-25-1187',
      quoteSource: 'Warranty certificate, p.6',
      reason: 'ISBP 821 paragraph A31 — a document presented but not required by the credit may be disregarded.',
      trace: [{ key: 'read by', value: 'Presentation & completeness review' }, { key: 'basis', value: 'ISBP821 A31' }],
    },
    {
      id: 'f-amt2', severity: 'clean', area: 'Amount', areaId: 'a4', checkId: 'AMT-30A',
      docId: 'INV', page: 1, creditTag: '32B',
      statement: 'AMOUNT DRAWN USD 50,000.00 EQUALS CREDIT AMOUNT',
      title: 'Amount drawn matches the credit exactly',
      detail: 'Invoice total USD 50,000.00 against a credit amount of USD 50,000.00.',
      expected: ':32B: USD50000,00',
      quote: 'Total: USD 50,000.00',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 30(a) — drawn amount inside the stated tolerance.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'basis', value: 'UCP600 art.30(a)' }],
    },
    {
      id: 'f-pres2', severity: 'clean', area: 'Presentation', areaId: 'a3', checkId: 'DATE-48',
      docId: 'INV', page: 1, creditTag: '48',
      statement: 'PRESENTED 18 NOV 2025, WITHIN 21 DAYS OF SHIPMENT AND BEFORE EXPIRY',
      title: 'Presented in time — 10 days after shipment',
      detail: 'Presented 18 November 2025 against a 21-day presentation period and expiry of 31 December 2025 in Amsterdam.',
      expected: ':48: 21/DAYS\n:31D: 251231AMSTERDAM',
      quote: 'Presented 18 NOV 2025 (day 10)',
      quoteSource: 'Presentation record',
      reason: 'UCP 600 articles 6(d) and 14(c) — within the presentation period and before expiry.',
      trace: [{ key: 'read by', value: 'Dates & shipment review' }, { key: 'basis', value: 'UCP600 art.6(d), 14(c)' }],
    },
    {
      id: 'f-cons2', severity: 'clean', area: 'Consistency', areaId: 'a5', checkId: 'XD-A23',
      docId: 'PKL', page: 3, creditTag: '45A',
      statement: 'QUANTITIES AGREE ACROSS INVOICE AND PACKING LIST',
      title: 'Quantities agree across the invoice and packing list',
      detail: '250 cartons at 20 units each is 5,000 units — the invoice quantity.',
      expected: 'Commercial invoice: 5,000 units',
      quote: 'Packing list: 250 cartons,\n20 units each',
      quoteSource: 'Packing list, p.3',
      reason: 'ISBP 821 paragraph A23 — no conflict between the documents.',
      trace: [{ key: 'read by', value: 'General review' }, { key: 'basis', value: 'ISBP821 A23' }],
    },
    {
      id: 'f-party2', severity: 'clean', area: 'Parties', areaId: 'a6', checkId: 'PARTY-FC04',
      docId: 'mt700', creditTag: '59',
      statement: 'PARTIES SCREENED — NO MATCHES',
      title: 'Parties screened — nothing to report',
      detail: 'Applicant, beneficiary and carrier screened against the current lists. No matches.',
      expected: 'Sanctions & parties screening',
      quote: 'No matches — screened 18 NOV 2025',
      quoteSource: 'Screening record',
      reason: 'Internal financial-crime policy.',
      trace: [{ key: 'read by', value: 'Sanctions & parties screening' }],
    },
    {
      id: 'm-lang2', severity: 'manual', area: 'No rule yet', areaId: null, checkId: null,
      docId: 'mt700', creditTag: '47A',
      statement: 'NOT CHECKED — FIELD 47A REQUIRES ALL DOCUMENTS IN ENGLISH, NO RULE DEFINED',
      title: 'A condition about document language has no rule behind it',
      detail: 'Field 47A requires all documents to be in English. No check in the dictionary covers document language.',
      expected: ':47A: ALL DOCUMENTS MUST BE IN ENGLISH',
      quote: 'Not checked — no rule defined',
      quoteSource: 'MT700, field 47A',
      reason: 'We only claim what we checked.',
      trace: [{ key: 'status', value: 'no rule in dictionary' }, { key: 'raised', value: 'dictionary request DR-2291' }],
    },
  ],
}

const CASE_03 = {
  sample: '03',
  applicantShort: 'Angela Roldan · Artfinder',
  beneficiaryShort: 'Cesca Falato',
  presentedDate: '20 Jun 2022',
  presentingBank: 'Barclays London · BARC/22/0617',
  authoriser: 'R. Meijer',
  docRefs: { INV: 'CF-2022-0617', BOL: 'DHL-8841207', PKL: 'PL-22-0617', BOE: 'BOE-22-0617', BC: 'BC-22-0617', WC: 'WC-22-0617' },
  lowConfidence: [],
  scanNotes: {},
  creditFacts: [
    { tag: '20', label: 'Credit number' },
    { tag: '32B', label: 'Amount', extra: '±10% (:39A: 10/10)' },
    { tag: '31D', label: 'Expiry' },
    { tag: '45A', label: 'Goods' },
    { tag: '46A', label: 'Documents required' },
    { tag: '43P', label: 'Partial shipments' },
    { tag: '48', label: 'Presentation period' },
  ],
  docFacts: {
    INV: [
      { page: 1, label: 'Invoice number', value: 'CF-2022-0617 · 15 Jun 2022' },
      { page: 1, label: 'Goods', value: 'Original oil painting "Stick Figure", 30x20cm' },
      { page: 1, label: 'Total', value: 'GBP 100.00' },
      { page: 1, label: 'Terms', value: 'DDP Miami' },
    ],
    BOL: [
      { page: 2, label: 'Waybill', value: 'DHL-8841207' },
      { page: 2, label: 'Dispatched', value: '16 Jun 2022' },
    ],
    PKL: [{ page: 3, label: 'Packing', value: '1 crate, 1 piece' }],
    BOE: [{ page: 4, label: 'Draft', value: 'BOE-22-0617 · at sight · GBP 100.00' }],
    BC: [{ page: 5, label: 'Certificate', value: 'BC-22-0617 · signed by the artist' }],
    WC: [{ page: 6, label: 'Certificate', value: 'WC-22-0617 · authenticity' }],
  },
  findings: [
    {
      id: 'f-amt3', severity: 'clean', area: 'Amount', areaId: 'a4', checkId: 'AMT-30A',
      docId: 'INV', page: 1, creditTag: '32B',
      statement: 'AMOUNT DRAWN GBP 100.00 EQUALS CREDIT AMOUNT',
      title: 'Amount drawn matches the credit exactly',
      detail: 'Invoice total GBP 100.00 against a credit amount of GBP 100.00.',
      expected: ':32B: GBP100,00', quote: 'Total: GBP 100.00', quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 30(a) — drawn amount inside the stated tolerance.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'basis', value: 'UCP600 art.30(a)' }],
    },
    {
      id: 'f-goods3', severity: 'clean', area: 'Goods description', areaId: 'a4', checkId: 'GOODS-18C',
      docId: 'INV', page: 1, creditTag: '45A',
      statement: 'GOODS DESCRIPTION ON INVOICE CORRESPONDS WITH FIELD 45A',
      title: 'Goods description corresponds with the credit',
      detail: 'Title, artist, dimensions and DDP Miami all appear as the credit states them.',
      expected: 'ORIGINAL OIL PAINTING\n"STICK FIGURE" BY CESCA FALATO, 30X20CM\n1 PIECE AT GBP100.00\nDDP MIAMI',
      quote: 'Original oil painting "Stick Figure"\nby Cesca Falato, 30x20cm — DDP Miami',
      quoteSource: 'Commercial invoice, p.1',
      reason: 'UCP 600 article 18(c) — the description corresponds with that in the credit.',
      trace: [{ key: 'read by', value: 'Goods, amounts & tolerance review' }, { key: 'basis', value: 'UCP600 art.18(c)' }],
    },
    {
      id: 'f-pres3', severity: 'clean', area: 'Presentation', areaId: 'a3', checkId: 'DATE-48',
      docId: 'INV', page: 1, creditTag: '48',
      statement: 'PRESENTED 20 JUN 2022, WITHIN 21 DAYS OF DISPATCH AND BEFORE EXPIRY 31 JUL 2022',
      title: 'Presented in time — 4 days after dispatch',
      detail: 'Presented 20 June 2022 against a 21-day presentation period and expiry of 31 July 2022 in London.',
      expected: ':48: 21/DAYS\n:31D: 220731LONDON',
      quote: 'Presented 20 JUN 2022 (day 4)', quoteSource: 'Presentation record',
      reason: 'UCP 600 articles 6(d) and 14(c) — within the presentation period and before expiry.',
      trace: [{ key: 'read by', value: 'Dates & shipment review' }, { key: 'basis', value: 'UCP600 art.6(d), 14(c)' }],
    },
    {
      id: 'f-cons3', severity: 'clean', area: 'Consistency', areaId: 'a5', checkId: 'XD-A23',
      docId: 'PKL', page: 3, creditTag: '45A',
      statement: 'INVOICE, PACKING LIST AND DRAFT AGREE',
      title: 'The set is internally consistent',
      detail: 'One piece on the invoice, one crate of one piece on the packing list, one draft for the same amount.',
      expected: 'Commercial invoice: 1 piece',
      quote: 'Packing list: 1 crate, 1 piece', quoteSource: 'Packing list, p.3',
      reason: 'ISBP 821 paragraph A23 — no conflict across the documents.',
      trace: [{ key: 'read by', value: 'General review' }, { key: 'basis', value: 'ISBP821 A23' }],
    },
    {
      id: 'f-party3', severity: 'clean', area: 'Parties', areaId: 'a6', checkId: 'PARTY-FC04',
      docId: 'mt700', creditTag: '59',
      statement: 'PARTIES SCREENED — NO MATCHES',
      title: 'Parties screened — nothing to report',
      detail: 'Applicant and beneficiary screened against the current lists. No matches.',
      expected: 'Sanctions & parties screening',
      quote: 'No matches — screened 20 JUN 2022', quoteSource: 'Screening record',
      reason: 'Internal financial-crime policy.',
      trace: [{ key: 'read by', value: 'Sanctions & parties screening' }],
    },
    {
      id: 'm-nodate3', severity: 'manual', area: 'No rule yet', areaId: null, checkId: null,
      docId: 'mt700', creditTag: '46A',
      statement: 'NOT CHECKED — NO FIELD 44C IN THIS CREDIT, NO LATEST SHIPMENT DATE TO TEST',
      title: 'This credit names no latest shipment date',
      detail: 'There is no field 44C, so no shipment-date check ran. For a courier-delivered artwork that is normal, but it means the only date control is the expiry — worth a glance.',
      expected: 'No :44C: in this credit',
      quote: 'Not checked — no latest shipment date',
      quoteSource: 'MT700',
      reason: 'A check that could not run is reported rather than counted as a pass.',
      trace: [{ key: 'status', value: 'trigger not met — :44C: absent' }],
    },
  ],
}

// ---- Case assembly ---------------------------------------------------------

/** Build the documents array: the credit plus one document per manifest segment. */
function buildDocuments(def, lines) {
  const sample = SAMPLES[def.sample]

  const credit = {
    id: 'mt700',
    role: 'credit',
    docType: 'Letter of credit',
    abbr: 'LC',
    fileName: `MT700_${tagValue(lines, '20') || def.sample}.txt`,
    reference: tagValue(lines, '20') || '',
    icon: 'file-text',
    pageRange: null,
    extraction: 'text',
    lowConfidence: false,
    scanNote: null,
    title: `SWIFT MT700 — ${tagValue(lines, '20') || ''}`,
    meta: 'text message · parsed by tag',
    lines,
    marks: [],
  }

  const presented = sample.segments.map((seg) => {
    const meta = DOC_TYPES[seg.code]
    const from = Math.min(...seg.pages)
    const to = Math.max(...seg.pages)
    return {
      id: seg.code,
      role: 'presented',
      docType: meta.docType,
      abbr: meta.abbr,
      fileName: `deal-${sample.id}.pdf`,
      reference: def.docRefs[seg.code],
      icon: meta.icon,
      pageRange: [from, to],
      pages: seg.pages,
      extraction: 'ocr',
      lowConfidence: def.lowConfidence.includes(seg.code),
      scanNote: def.scanNotes[seg.code] ?? null,
      title: `${meta.docType} ${def.docRefs[seg.code]}`,
      meta: `scan ${from === to ? `page ${from}` : `pages ${from}–${to}`} of ${sample.totalPages} · 300 dpi`,
      lines: [],
      marks: [],
    }
  })

  return [credit, ...presented]
}

/** Facts: credit tags plus the authored per-document extractions. */
function buildFacts(def, lines) {
  const creditFacts = def.creditFacts
    .filter((f) => lines.some((l) => l.tag === f.tag))
    .map((f) => {
      const raw = tagValue(lines, f.tag) || ''
      return {
        docId: 'mt700',
        anchorId: `tag-${f.tag}`,
        page: null,
        label: f.label,
        value: f.extra ? `${raw} ${f.extra}` : raw,
        source: `:${f.tag}:`,
        // The credit is text, not a scan: we read it exactly.
        confidence: 'HIGH',
        sourceText: raw,
        flag: f.flag ?? null,
      }
    })

  const docFacts = Object.entries(def.docFacts).flatMap(([code, facts]) =>
    facts.map((f) => ({
      docId: code,
      anchorId: null,
      page: f.page,
      label: f.label,
      value: f.value,
      source: `p.${f.page}`,
      // How well the extractor read it. Absent means HIGH — the normal case,
      // which the panel renders with no decoration at all.
      confidence: f.conf ?? 'HIGH',
      // The raw line the value was lifted from, so an officer can check our
      // reading without leaving the panel.
      sourceText: f.src ?? null,
      flag: f.flag ?? null,
    })),
  )

  return [...creditFacts, ...docFacts]
}

/**
 * The plan: catalogue entries whose trigger this credit satisfies, plus whatever
 * the planner wrote for this credit's own conditions.
 *
 * Each entry carries the rule it will apply and the request that will be sent to
 * execute it, so the plan is reviewable before it runs rather than after.
 */
function buildChecks(def, lines, credit, documents) {
  const tags = {}
  lines.forEach((l) => { if (l.tag) tags[l.tag] = l.text.replace(new RegExp(`^:${l.tag}:\\s*`), '') })

  const findingByCheck = {}
  def.findings.forEach((f) => { if (f.checkId) findingByCheck[f.checkId] = f.id })

  // Documents a check reads. The planner scopes each check to the documents it
  // needs; sending the whole bundle to every check is how you get slow, expensive
  // runs and findings drawn from documents the rule never mentioned.
  const docsFor = (areaId) => {
    const presented = documents.filter((d) => d.role === 'presented')
    if (areaId === 'a3') return presented.filter((d) => ['BOL', 'INV'].includes(d.id))
    if (areaId === 'a4') return presented.filter((d) => ['INV', 'PKL'].includes(d.id))
    if (areaId === 'a6') return []
    return presented
  }

  const withPlan = (check, spec) => ({
    ...check,
    spec,
    executionPlan: buildExecutionPlan({
      check,
      spec,
      credit,
      creditInputs: Object.keys(tags)
        .filter((t) => (spec.rule.match(/\{(\d{2}[A-Z]?)\}/g) || []).some((m) => m.slice(1, -1) === t))
        .map((t) => ({ tag: t, value: tags[t] })),
      documents: docsFor(check.areaId).map((d) => ({
        docType: d.docType,
        reference: d.reference,
        pages: d.pageRange[0] === d.pageRange[1] ? `p.${d.pageRange[0]}` : `p.${d.pageRange[0]}–${d.pageRange[1]}`,
      })),
    }),
  })

  const fromCatalogue = CHECK_CATALOG
    .map((c) => {
      const applies = c.appliesWhen(tags)
      const spec = checkSpec(c.id)
      const check = {
        id: c.id,
        name: c.name,
        // areaId null marks "not run for this credit" — the trigger was not met.
        areaId: applies ? c.areaId : null,
        appliesBecause: applies ? c.because(tags) : `Not brought into play: ${c.because(tags)}`,
        ruleRef: c.ruleRef,
        findingId: findingByCheck[c.id] ?? null,
        addedByOfficer: false,
        plannedByLlm: false,
        notCovered: false,
        source: 'dictionary',
      }
      return withPlan(check, spec)
    })

  const fromPlanner = (def.plannerChecks ?? []).map((c) => {
    const spec = { agent: 'General review', severity: c.severity, refs: c.refs, rule: c.rule }
    const check = {
      id: c.id,
      name: c.name,
      areaId: c.areaId,
      appliesBecause: c.appliesBecause,
      ruleRef: c.ruleRef,
      findingId: c.findingId,
      addedByOfficer: false,
      plannedByLlm: true,
      notCovered: !!c.notCovered,
      source: 'planner',
    }
    return withPlan(check, spec)
  })

  return [...fromCatalogue, ...fromPlanner]
}

/**
 * The model's finding, as the markdown it returns.
 *
 * Four headings, always the same four, always in this order: what was required,
 * what arrived, why that does or does not satisfy the rule, and what can be done.
 * A free-text blob makes an officer hunt for those four things and makes two
 * findings impossible to compare.
 *
 * Markdown rather than a bag of fields because that is what the model actually
 * emits, and the officer can read the source of what they are signing off.
 */
function analysisMarkdown(f, a) {
  const options = a.options?.length
    ? `\n## What you can do\n\n${a.options.map((o) => `1. ${o}`).join('\n')}\n`
    : ''
  const cite = f.trace.find((t) => t.key === 'basis')?.value
  const confidence =
    a.confidence && a.confidence !== 'HIGH'
      ? `\n> **${a.confidence === 'LOW' ? 'Low' : 'Medium'} confidence.** ${
          a.confidence === 'LOW'
            ? 'We could not read enough to be sure — treat this as a prompt to look, not a conclusion.'
            : 'The reasoning holds, but check the original before you rely on it.'
        }\n`
      : ''

  return `## What the credit requires

${a.requirement}

\`\`\`
${f.expected}
\`\`\`

## What was presented

${a.presented}

\`\`\`
${f.quote}
\`\`\`

*${f.quoteSource}*

## ${f.severity === 'clean' ? 'Why this satisfies the rule' : 'Why that is a problem'}

${a.why}
${cite ? `\n**Basis:** ${cite}\n` : ''}${options}${confidence}`
}

/**
 * Findings, resolved onto the doc ids and credit anchors the UI navigates by.
 *
 * Where a finding has no analysis authored (the clean ones, mostly), it is
 * derived from the evidence already on the record rather than left blank: a
 * clean result still has to say what it checked.
 */
function buildFindings(def) {
  return def.findings.map((f) => {
    const analysis = f.analysis ?? {
      requirement: f.expected.split('\n').join(' '),
      presented: `${f.quote.split('\n').join(' ')} — ${f.quoteSource}.`,
      why: f.reason,
      options: f.severity === 'clean' ? ['Nothing to do — recorded as checked.'] : [],
      confidence: f.severity === 'clean' ? 'HIGH' : 'MED',
    }
    return {
      id: f.id,
      severity: f.severity,
      area: f.area,
      areaId: f.areaId,
      checkId: f.checkId,
      docId: f.docId,
      page: f.page ?? null,
      anchorId: null,
      creditAnchorId: `tag-${f.creditTag}`,
      title: f.title,
      // The formal one-liner for the refusal advice (MT734 field 77J). Short,
      // quotable, in the register a checker writes in — distinct from the title
      // (a readable headline) and from the analysis (the reasoning).
      statement: f.statement,
      detail: f.detail,
      expected: f.expected,
      quote: f.quote,
      quoteSource: f.quoteSource,
      reason: f.reason,
      analysis,
      analysisMarkdown: analysisMarkdown(f, analysis),
      trace: f.trace,
    }
  })
}

const DEFS = { '01': CASE_01, '02': CASE_02, '03': CASE_03 }

/**
 * @param {string} defKey which authored case
 * @param {object} overrides id, status, replyDueDays, runState
 * @returns {CaseDetail}
 */
function buildCase(defKey, overrides) {
  const def = DEFS[defKey]
  const sample = SAMPLES[def.sample]
  const lines = parseMt700Lines(sample.lcText)

  const amountRaw = tagValue(lines, '32B') || ''
  const currency = amountRaw.slice(0, 3)
  const amount = Number(amountRaw.slice(3).replace(/\./g, '').replace(',', '.')) || 0
  const tolerance = Number((tagValue(lines, '39A') || '0/0').split('/')[0]) || 0

  const creditTerms = {
    creditRef: tagValue(lines, '20') || '',
    issuedDate: tagValue(lines, '31C') || '',
    applicant: def.applicantShort,
    beneficiary: def.beneficiaryShort,
    currency,
    amount,
    tolerancePct: tolerance,
    latestShipment: tagValue(lines, '44C') || null,
    expiry: tagValue(lines, '31D') || '',
    expiryPlace: (tagValue(lines, '31D') || '').slice(6) || '',
    presentationDays: Number((tagValue(lines, '48') || '21').split('/')[0]) || 21,
    tenor: tagValue(lines, '42C') || 'At sight',
    goods: (tagValue(lines, '45A') || '').split('\n').join(' · '),
  }

  // The checks need the credit and the document set to compile their execution
  // plans, so both are built before the case object rather than inside it.
  const documents = buildDocuments(def, lines)

  return {
    id: overrides.id,
    status: overrides.status,
    credit: creditTerms,
    presentedDate: def.presentedDate,
    presentingBank: def.presentingBank,
    replyDueDays: overrides.replyDueDays,
    authoriser: def.authoriser,
    pdfUrl: sample.pdfUrl,
    totalPages: sample.totalPages,
    documents,
    bundlePages: sample.segments.flatMap((seg) =>
      seg.pages.map((n) => ({ number: n, docId: seg.code, label: DOC_TYPES[seg.code].docType })),
    ),
    facts: buildFacts(def, lines),
    areas: AREAS,
    checks: buildChecks(def, lines, creditTerms, documents),
    findings: buildFindings(def),
    runSteps: RUN_STEPS,
    runModelSummary: '3 models · 30 calls · 2 repairs · 6 pages OCR · prompt cache 43%',
    // The run state the case is already in when it loads. A finished case needs
    // no run before Review and Decision have something to show.
    runState: overrides.runState,
  }
}

const FINISHED = { started: true, finished: true, segmented: 6, completedAreaIds: ALL_AREA_IDS }
const FRESH = { started: false, finished: false, segmented: 0, completedAreaIds: [] }

/** Which authored case and run state each list row resolves to. */
const CASE_INDEX = {
  'CHK-25-0128-014': { def: '01', status: 'discrepancies', replyDueDays: 3, runState: FINISHED },
  'CHK-25-0128-011': { def: '02', status: 'awaiting_check', replyDueDays: 5, runState: FRESH },
  'CHK-25-0127-009': { def: '03', status: 'clean', replyDueDays: 6, runState: FINISHED },
  'CHK-25-0127-008': { def: '02', status: 'discrepancies', replyDueDays: 0, runState: FINISHED },
  'CHK-25-0126-004': { def: '01', status: 'with_authoriser', replyDueDays: 2, runState: FINISHED },
}

/** @type {import('./contracts.js').CaseSummary[]} */
export const CASE_LIST = Object.entries(CASE_INDEX).map(([id, e]) => {
  const detail = buildCase(e.def, { id, ...e })
  const revealed = e.runState.finished ? detail.findings : []
  const discrepancies = revealed.filter((f) => f.severity === 'discrepancy').length
  const toDecide = revealed.filter((f) => f.severity === 'possible' || f.severity === 'manual').length
  return {
    id,
    creditRef: detail.credit.creditRef,
    beneficiary: detail.credit.beneficiary,
    currency: detail.credit.currency,
    amount: detail.credit.amount,
    pageCount: detail.totalPages,
    status: e.status,
    statusLabel:
      e.status === 'awaiting_check' ? 'Awaiting check'
        : e.status === 'clean' ? 'Clean'
          : e.status === 'with_authoriser' ? 'With authoriser'
            : discrepancies ? `${discrepancies} discrepanc${discrepancies === 1 ? 'y' : 'ies'}`
              : `${toDecide} to decide`,
    replyDueDays: e.replyDueDays,
    mine: e.def !== '03',
  }
})

export function caseDetailFor(id) {
  const entry = CASE_INDEX[id]
  if (!entry) return null
  return buildCase(entry.def, { id, ...entry })
}

// The two files an officer drops to open a case.
export const INTAKE_SLOTS = [
  { id: 'credit', role: 'Letter of credit', icon: 'file-text', fileName: 'lc.txt', meta: 'MT700 · 1 KB' },
  { id: 'bundle', role: 'Presented documents', icon: 'file-stack', fileName: 'deal-01.pdf', meta: '6 pages · 482 KB' },
]

/**
 * What the spend is judged against.
 *
 * Three deliberate choices here, because the obvious framing is misleading:
 *
 * 1. HANDLING TIME, NOT MACHINE TIME. "45 minutes by hand versus 16 seconds" is
 *    a ratio nobody can bank. This is an officer-paced pipeline: the machine
 *    proposes, a person reads every finding and signs. The comparison that
 *    schedules capacity is unaided examination against machine time PLUS the
 *    officer review that remains. That is a real saving, and a much smaller one.
 *
 * 2. TWO FAILURE DIRECTIONS, NOT ONE ACCURACY NUMBER. A false alarm costs an
 *    officer a few minutes. A miss can cost the value of the drawing: under UCP
 *    600 article 16(f) a bank that fails to give notice of refusal in time is
 *    *precluded* from claiming the documents are non-compliant — it must pay.
 *    Averaging those into one percentage hides the only one that can hurt you.
 *
 * 3. TURNAROUND AGAINST THE RULE, NOT AGAINST ZERO. UCP 600 article 14(b) gives
 *    the bank five banking days after presentation to examine and decide. Speed
 *    matters up to the point where the window is comfortable and not after, so
 *    the useful figure is headroom against that limit.
 *
 * These come from the bank's own records rather than from usage, so in
 * production they arrive from the service alongside the spend.
 */
export const SPEND_BENCHMARK = {
  period: 'Last 30 days',

  // Time, in minutes per case.
  manualMinutesPerCase: 45,      // unaided examination, measured before rollout
  officerMinutesPerCase: 11,     // reading findings and deciding — this remains
  casesPerExaminerDayBefore: 9,
  casesPerExaminerDayAfter: 26,

  // Turnaround against UCP 600 art. 14(b).
  examinationWindowDays: 5,
  medianDecisionHours: 6.2,
  slowestDecisionHours: 31,

  // Quality, split by direction.
  findingsReviewed: 417,
  upheld: 383,                   // checker agreed
  overturned: 34,                // we raised it, checker disagreed — costs time
  missed: 3,                     // found downstream — costs money
  missedNote: 'two insurance cover, one charter-party wording',
  overturnedTopCause: 'insurance cover',

  // What the rulebook actually reached.
  conditionsCoveredPct: 86,
}

export const ASK_SUGGESTIONS = [
  {
    id: 'q1',
    label: 'Why is this a discrepancy?',
    answer: 'The credit fixes the last day for shipment at 31 December 2024 and the bill of lading shows the goods on board on 14 January 2025. Nothing in the presentation cures a date that has passed — only the applicant can waive it.',
  },
  {
    id: 'q2',
    label: 'Can it be cured?',
    answer: 'Not by the beneficiary. Two routes: ask the applicant to waive it, or refuse and hold the documents at their disposal. A waiver is the usual outcome when the goods have already sailed.',
  },
  {
    id: 'q3',
    label: 'Show me the rule',
    answer: 'UCP 600 article 14(c) with field 44C: a presentation must not show shipment later than the latest shipment date in the credit. ISBP 821 A19 confirms the on-board date governs, not the issuance date of the bill of lading.',
  },
]

export { AREAS, RUN_STEPS }
