// ===========================================================================
// What a check actually is.
//
// A check in the plan is not a label — it is a governance artefact that gets
// compiled into a request to a model. This file holds the half an officer needs
// to trust it:
//
//   rule      the plain-language condition, authored in Governance, written in
//             the same {token} vocabulary the rule editor highlights
//   refs      the UCP/ISBP articles it stands on
//   agent     which domain agent owns it
//   severity  what a failure means
//
// plus `buildExecutionPlan`, which renders the request that will be sent for a
// specific credit. That plan is the point: an officer signing off on an
// AI-assisted review is entitled to read the instruction the model was given,
// not a summary of it.
//
// In production the rule text comes from the governance service (the same
// records the Governance module edits) and the plan is compiled server-side.
// Here both are fixtures with the same shape.
// ===========================================================================

/** @typedef {{ rule: string, refs: string[], agent: string, severity: 'CRITICAL'|'MAJOR'|'MINOR' }} CheckSpec */

/** @type {Record<string, CheckSpec>} */
export const CHECK_SPECS = {
  'REQ-46A': {
    agent: 'Requirements',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.14'],
    rule: `Read {46A} and list every document the credit calls for, with the number of originals and copies of each.

This list is the ground truth for the rest of the review — all completeness checks measure against it, so do not infer documents that are not named and do not drop ones that are.

Fields to look at: {46A} (documents required), {47A} (additional conditions)`,
  },
  'REQ-31D': {
    agent: 'Requirements',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.6', 'UCP600 Art.14'],
    rule: `Settle the dates and tolerances that govern this presentation: expiry from {31D}, latest shipment from {44C} when present, presentation period from {48}, and amount tolerance from {39A}.

Where a field is absent, say so explicitly. An absent {44C} means there is no latest shipment date to test — it must not be treated as a pass.

Fields to look at: {31D}, {44C}, {48}, {39A}`,
  },
  'REQ-40E': {
    agent: 'Requirements',
    severity: 'MINOR',
    refs: ['UCP600 Art.1', 'ISBP821 A'],
    rule: `Confirm which rulebook governs. When {40E} reads UCP LATEST VERSION, apply UCP 600 together with ISBP 821.

Fields to look at: {40E}`,
  },
  'DOCSET-14A': {
    agent: 'Presentation & Completeness',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.14'],
    rule: `Every document named in {46A} must be present in the presentation.

Where the credit requires a document to *state* something, that statement must appear on it — a document that is present but silent on a required statement does not satisfy the requirement.

Fields to look at: {46A}`,
  },
  'DOCSET-17': {
    agent: 'Presentation & Completeness',
    severity: 'MAJOR',
    refs: ['UCP600 Art.17'],
    rule: `Originals and copies must match what {46A} calls for. Confirm the count of each, and that anything described as an original is an original within the meaning of UCP 600 article 17.

Fields to look at: {46A}`,
  },
  'DOCSET-03': {
    agent: 'Presentation & Completeness',
    severity: 'MAJOR',
    refs: ['UCP600 Art.3', 'UCP600 Art.18'],
    rule: `A document must be signed where the credit or the rules require a signature.

If the signature is present but cannot be read, do not raise a discrepancy — report that it could not be read and hand it to the officer. An unreadable signature and a missing signature are not the same finding.

Fields to look at: {46A}`,
  },
  'DOCSET-A31': {
    agent: 'Presentation & Completeness',
    severity: 'MINOR',
    refs: ['ISBP821 A31'],
    rule: `A document presented but not called for by {46A} may be disregarded and returned to the presenter.

Surface it so the officer knows it arrived, but do not examine it as though it were required, and do not raise a discrepancy against its contents.

Fields to look at: {46A}`,
  },
  'DATE-44C': {
    agent: 'Dates & Shipment',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.14'],
    rule: `Shipment must not be later than {44C}.

Read the on-board date from the transport document — the on-board notation governs, not the issuance date of the bill of lading. If shipment is after {44C} then raise a discrepancy: this cannot be cured by the beneficiary, only waived by the applicant.

Fields to look at: {44C}, {DOC.OBD} (on-board date)`,
  },
  'DATE-48': {
    agent: 'Dates & Shipment',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.14'],
    rule: `Documents must be presented within the period {48} allows, counted from the date of shipment.

Fields to look at: {48}, {DOC.OBD}, {CALC.PRES} (presentation date)`,
  },
  'DATE-31D': {
    agent: 'Dates & Shipment',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.6'],
    rule: `Presentation must be on or before the expiry date in {31D}, at the place {31D} names.

Fields to look at: {31D}, {CALC.PRES}`,
  },
  'GOODS-18C': {
    agent: 'Goods, Amounts & Tolerance',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.18', 'ISBP821 C3'],
    rule: `The goods description on the commercial invoice must correspond with {45A}.

Correspond does not mean identical: reordered wording is acceptable. A missing element that the credit names as part of the description — model, grade, crop year, origin — is not. Data on any document must not conflict with the credit.

Fields to look at: {45A}`,
  },
  'AMT-30A': {
    agent: 'Goods, Amounts & Tolerance',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.30'],
    rule: `The amount drawn must fall within {32B} as varied by the tolerance in {39A}.

Compute the permitted range and state it. Where {39A} is absent, no tolerance applies.

Fields to look at: {32B}, {39A}`,
  },
  'AMT-C6': {
    agent: 'Goods, Amounts & Tolerance',
    severity: 'MAJOR',
    refs: ['ISBP821 C6'],
    rule: `Quantity and unit price on the invoice must agree with {45A}, and must multiply out to the invoice total.

Fields to look at: {45A}, {32B}`,
  },
  'TRANS-20': {
    agent: 'General Review',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.20'],
    rule: `Examine the transport document for form, consignee, endorsement and freight notation as {46A} requires.

Where a bill of lading is to order, the required endorsement must appear.

Fields to look at: {46A}`,
  },
  'TRANS-43P': {
    agent: 'General Review',
    severity: 'MAJOR',
    refs: ['UCP600 Art.31'],
    rule: `When {43P} reads NOT ALLOWED, the presentation must not show partial shipment.

Fields to look at: {43P}`,
  },
  'TRANS-43T': {
    agent: 'General Review',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.20'],
    rule: `When {43T} reads NOT ALLOWED, a transport document indicating that transhipment will or may take place is discrepant.

The exception is goods shipped in a container where the transport document covers the entire carriage — check for that before raising.

Fields to look at: {43T}, {44E}, {44F}`,
  },
  'COND-47A': {
    agent: 'General Review',
    severity: 'CRITICAL',
    refs: ['UCP600 Art.14'],
    rule: `Each condition in {47A} must be satisfied by the documents presented.

Treat every clause separately. Where a condition requires a document to quote a reference, that exact reference must appear. Where a condition cannot be tested by any rule in the dictionary, do not pass it — report it as not covered so a person reads it.

Fields to look at: {47A}`,
  },
  'XD-A23': {
    agent: 'General Review',
    severity: 'MAJOR',
    refs: ['ISBP821 A23'],
    rule: `Data in one document need not repeat another exactly, but must not conflict with it, with the credit, or with international standard banking practice.

Compare quantities, weights, marks, dates and party names across the whole set.`,
  },
  'GEN-01': {
    agent: 'General Review',
    severity: 'MINOR',
    refs: [],
    rule: `Read the presentation as an experienced checker would and raise anything the other areas do not own.

Only report something you can point at in a document. Do not speculate.`,
  },
  'PARTY-FC04': {
    agent: 'Sanctions & Parties',
    severity: 'CRITICAL',
    refs: [],
    rule: `Screen every named party, the vessel and both ports against the current restricted-party lists.

Re-run at the point of payment — a clear screening at examination does not carry.

Fields to look at: {50}, {59}, {44E}, {44F}, {EXT.SANCTIONS}`,
  },
  'TRANS-22': {
    agent: 'General Review',
    severity: 'MAJOR',
    refs: ['UCP600 Art.22'],
    rule: `Where the credit calls for a charter-party bill of lading, examine it under UCP 600 article 22 rather than article 20.

Fields to look at: {46A}`,
  },
  'CERT-28': {
    agent: 'General Review',
    severity: 'MAJOR',
    refs: ['UCP600 Art.28'],
    rule: `Insurance cover must be for at least the percentage of invoice value the credit requires, in the currency of the credit, and claims payable where the credit says.

Fields to look at: {46A}, {32B}`,
  },
}

export const checkSpec = (id) =>
  CHECK_SPECS[id] ?? { agent: 'General Review', severity: 'MAJOR', refs: [], rule: '' }

/**
 * Render the request that will be sent to the model for one check on one credit.
 *
 * Markdown rather than JSON on purpose: this is the artefact a human reviews
 * before it is executed, and it is the same text the model receives. Showing a
 * prettified summary instead of the real payload would defeat the point.
 *
 * @param {object} args
 * @param {import('./contracts.js').PlanCheck} args.check
 * @param {CheckSpec} args.spec
 * @param {import('./contracts.js').CreditTerms} args.credit
 * @param {{ tag: string, value: string }[]} args.creditInputs
 * @param {{ docType: string, pages: string, reference: string }[]} args.documents
 * @returns {string}
 */
export function buildExecutionPlan({ check, spec, credit, creditInputs, documents }) {
  const refs = spec.refs.length ? spec.refs.join(', ') : 'none cited'
  const inputs = creditInputs.length
    ? creditInputs.map((i) => `  - :${i.tag}: ${JSON.stringify(i.value)}`).join('\n')
    : '  - (none — this check reads documents only)'
  const docs = documents.length
    ? documents.map((d) => `  - ${d.docType} (${d.reference}) — bundle ${d.pages}`).join('\n')
    : '  - (whole presentation)'

  return `# ${check.id} — ${check.name}

owner:      ${spec.agent} agent
severity:   ${spec.severity}
references: ${refs}
credit:     ${credit.creditRef}

## Why this check is in the plan
${check.appliesBecause}.

## Rule (from the checks dictionary)
${spec.rule}

## Inputs
credit fields:
${inputs}

documents in scope:
${docs}

## Instructions
1. Read only the documents listed above. Do not infer facts from documents not in scope.
2. Apply the rule exactly as written. Where it distinguishes cases, say which case applies.
3. Quote the wording you relied on, verbatim, with the page it came from.
4. If the evidence is missing or unreadable, return \`inconclusive\` — do not guess.
5. Cite the article you are relying on, from the references above only.

## Required output
\`\`\`json
{
  "verdict": "pass | discrepancy | possible | inconclusive",
  "title": "one line an officer can read",
  "expected": "what the credit requires, quoted",
  "presented": "what the documents show, quoted",
  "why": "why that does or does not satisfy the rule",
  "citation": "UCP600 Art.x / ISBP821 y",
  "evidence": [{ "document": "...", "page": 0, "quote": "..." }],
  "confidence": "HIGH | MED | LOW"
}
\`\`\`
`
}
