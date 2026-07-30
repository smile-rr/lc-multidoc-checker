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

// ---------------------------------------------------------------------------
// A check varies along two axes, and they are independent. Conflating them is
// what made the plan screen read as nonsense: it had a group called
// "Requirements" (an agent's domain) sitting next to a badge called
// "Requirement" (a kind of card), which are not the same thing at all.
//
//   SOURCE     where the obligation comes from — the credit's own text, UCP 600
//              and ISBP 821, or the bank's policy. This is what you cite when
//              you refuse, and who may change the check.
//   KIND       how it is settled — the system comparing extracted fields, or an
//              agent reading prose. This is what it costs and how far it can be
//              trusted.
//
// They cross freely. "Shipment on or before the latest date" is the *credit's*
// requirement (field 44C) settled *deterministically*. "Goods description
// corresponds" is also the credit's (field 45A) but needs *judgement*. "No
// documents beyond those called for" is *practice* (ISBP A31) and needs
// judgement. "Parties screened" is *policy*.
//
// So: source groups the plan, because an examiner works outward from the credit
// and a refusal advice is written that way. Kind is a marker on the row, because
// it is a property of the check, not a section of the work.
// ---------------------------------------------------------------------------

export const SOURCES = ['credit', 'practice', 'policy']

export const SOURCE_META = {
  credit: {
    label: 'From this credit',
    note: "The applicant's own terms — fields 46A and 47A and the credit's data. Different on every case, and only the applicant can waive them.",
    icon: 'file-text',
    color: 'var(--me-blue-deep)',
    cite: 'the credit',
  },
  practice: {
    label: 'UCP 600 & ISBP 821',
    note: 'Standing practice. Applies to every credit unless this one excludes it (UCP 600 art. 1).',
    icon: 'scale',
    color: 'var(--me-navy)',
    cite: 'UCP 600 / ISBP 821',
  },
  policy: {
    label: 'Bank policy',
    note: "Ours, not the credit's. A hold here is not a UCP discrepancy and is not waivable by the applicant.",
    icon: 'shield-check',
    color: '#946400',
    cite: 'internal policy',
  },
}

// Classified by where the *content* of the obligation sits, not by which article
// describes how to examine it. When you write "documents required by field 46A
// not presented" you are citing the credit; UCP 14(a) is the standard you
// applied, not the requirement you applied it to.
const SOURCE_OF = {
  'REQ-46A': 'credit', 'REQ-31D': 'credit', 'DOCSET-14A': 'credit', 'DOCSET-17': 'credit',
  'DATE-44C': 'credit', 'DATE-48': 'credit', 'DATE-31D': 'credit', 'AMT-30A': 'credit',
  'GOODS-18C': 'credit', 'COND-47A': 'credit', 'TRANS-43P': 'credit', 'TRANS-43T': 'credit',
  'CERT-28': 'credit',

  'REQ-40E': 'practice', 'DOCSET-03': 'practice', 'DOCSET-A31': 'practice',
  'TRANS-20': 'practice', 'TRANS-22': 'practice', 'XD-A23': 'practice',
  'AMT-C6': 'practice', 'GEN-01': 'practice',

  'PARTY-FC04': 'policy',
}
// A check the planner wrote for one of this credit's own 47A conditions is the
// credit's by definition; an officer-added one is the officer's own concern and
// is grouped by who added it, not by what it cites.
export const checkSource = (id) => SOURCE_OF[id] ?? 'credit'

// Which kind of card the check came from, and therefore who executes it.
//
// A Rule card is rows over named fields: the system evaluates it, in
// milliseconds, for nothing, and the same inputs always give the same answer. A
// Requirement card is prose read against the presentation by an agent: it costs
// tokens and seconds and its answer is a judgement.
//
// This is the same split Governance authors, carried through unchanged. Anything
// not named here is a requirement — the same default a check is born with.
export const RULE_CHECKS = ['DATE-44C', 'DATE-48', 'DATE-31D', 'AMT-30A', 'AMT-C6', 'XD-A23']
export const checkKind = (id) => (RULE_CHECKS.includes(id) ? 'rule' : 'requirement')

// The rows a Rule card evaluates, and the field each side reads. `factLabel` and
// `factDoc` are the join between the dictionary's vocabulary and what Interpret
// actually produced — the label it was extracted under, and the document it came
// off.
//
// Both halves are load-bearing. Matching on the label alone made every
// cross-document row resolve both sides to the same fact, so a rule comparing the
// invoice against the credit rendered as a value compared with itself, and passed.
//
// A rule is only answerable if every operand resolved. When one did not, the
// plan says so before anything runs, and the result is "not covered" — never a
// pass. A missing input is not evidence of compliance.
export const RULE_ROWS = {
  'DATE-44C': {
    scope: 'When the credit states a latest shipment date',
    message: 'Shipment was effected after the latest shipment date stated in the credit.',
    rows: [{ l: { field: 'On-board date', doc: 'Bill of lading', factLabel: 'On board', factDoc: 'BOL' }, op: 'is on or before', r: { field: 'Latest shipment date', doc: 'Letter of credit', factLabel: 'Latest shipment', factDoc: 'mt700' }, tol: '' }],
  },
  'DATE-48': {
    scope: 'Every presentation',
    message: 'Documents were presented outside the presentation period.',
    rows: [{ l: { field: 'Presentation date', doc: 'Covering schedule', factLabel: 'Presentation date', factDoc: 'schedule' }, op: 'is within', r: { field: 'On-board date', doc: 'Bill of lading', factLabel: 'On board', factDoc: 'BOL' }, tol: '21 calendar days' }],
  },
  'DATE-31D': {
    scope: 'Every presentation',
    message: 'Documents were presented after the credit expired.',
    rows: [{ l: { field: 'Presentation date', doc: 'Covering schedule', factLabel: 'Presentation date', factDoc: 'schedule' }, op: 'is on or before', r: { field: 'Expiry date', doc: 'Letter of credit', factLabel: 'Expiry', factDoc: 'mt700' }, tol: '' }],
  },
  'AMT-30A': {
    scope: 'Every presentation with a commercial invoice',
    message: 'The invoice value exceeds the credit amount, tolerance included.',
    rows: [
      { l: { field: 'Invoice value', doc: 'Commercial invoice', factLabel: 'Total', factDoc: 'INV' }, op: 'is at most', r: { field: 'Credit amount', doc: 'Letter of credit', factLabel: 'Amount', factDoc: 'mt700' }, tol: 'tolerance from 39A' },
      { l: { field: 'Currency', doc: 'Commercial invoice', factLabel: 'Total', factDoc: 'INV' }, op: 'equals', r: { field: 'Currency', doc: 'Letter of credit', factLabel: 'Amount', factDoc: 'mt700' }, tol: '' },
    ],
  },
  'AMT-C6': {
    scope: 'When the credit states a quantity and a unit price',
    message: 'Quantity times unit price does not equal the invoice total.',
    // Both sides are read off the same page. It used to declare the left side as a
    // `literal`, which rendered as "not extracted" — saying we had no figure when
    // we had the line the figure is computed from.
    rows: [{ l: { field: 'Quantity × unit price', doc: 'Commercial invoice', factLabel: 'Quantity', factDoc: 'INV' }, op: 'multiplies out to', r: { field: 'Invoice value', doc: 'Commercial invoice', factLabel: 'Total', factDoc: 'INV' }, tol: '' }],
  },
  'XD-A23': {
    scope: 'Every presentation, across all documents',
    message: 'Data on the documents conflicts within the same presentation.',
    // The second row used to compare the beneficiary name against itself, reading
    // both sides off the invoice *number*. What this check actually catches in these
    // presentations is the quantity, so that is what it now compares.
    rows: [
      { l: { field: 'Goods description', doc: 'Commercial invoice', factLabel: 'Goods', factDoc: 'INV' }, op: 'does not conflict with', r: { field: 'Goods description', doc: 'Letter of credit', factLabel: 'Goods', factDoc: 'mt700' }, tol: 'general terms allowed' },
      { l: { field: 'Quantity packed', doc: 'Packing list', factLabel: 'Packing', factDoc: 'PKL' }, op: 'agrees with', r: { field: 'Quantity invoiced', doc: 'Commercial invoice', factLabel: 'Quantity', factDoc: 'INV' }, tol: '' },
    ],
  },
}

/**
 * Resolve a rule's operands against what Interpret extracted.
 *
 * Returns one entry per operand with the value found and its confidence, or
 * `resolved: false` when the field is not there. `ready` is the whole point of
 * showing this in the plan: it is knowable before a single token is spent.
 */
export function resolveRuleInputs(id, facts = []) {
  const def = RULE_ROWS[id]
  if (!def) return null
  // Label *and* document. A rule reads a named field off a named document, and two
  // documents routinely carry the same field name — that is the whole point of a
  // cross-document check.
  const find = (o) => facts.find((f) => f.label === o.factLabel && (!o.factDoc || f.docId === o.factDoc)) ?? null
  const operands = def.rows.flatMap((r) => [r.l, r.r].filter((o) => o && o.factLabel))
  const seen = new Set()
  const inputs = operands
    .filter((o) => { const k = `${o.field ?? o.literal}|${o.doc ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true })
    .map((o) => {
      const fact = find(o)
      return {
        field: o.field ?? o.literal,
        // "computed" rather than "derived": an operand the rule works out from a
        // line rather than reading straight off one still has to say where it came
        // from, in a word an examiner reads rather than decodes.
        doc: o.doc ?? 'computed',
        resolved: !!fact,
        value: fact ? fact.value : null,
        confidence: fact ? fact.confidence : null,
      }
    })
  const missing = inputs.filter((i) => !i.resolved)
  return { ...def, inputs, missing, ready: missing.length === 0 }
}

/**
 * What a rule produced: each row with the values it actually compared.
 *
 * This is the evidence for a computed finding, and it replaces the model's
 * reasoning because there is none — nothing formed a view here, two values were
 * compared. An officer checking such a finding is checking arithmetic, and what
 * they need is the arithmetic: both sides, where each was read, and which row
 * failed.
 *
 * `failedRow` is authored on the finding, because the fixtures hold values as they
 * appear on the page ("14 JAN 2025") rather than as comparable types. It used to be
 * guessed from severity — which fixed the failure to row 0 and could only fail at
 * all on a discrepancy, so a multi-row rule always blamed its first row and a rule
 * whose failure the officer still has to weigh showed every row passing. A real
 * evaluator returns it per row; the shape is the same.
 */
export function ruleOutcome(id, facts = [], failedRow = null) {
  const def = resolveRuleInputs(id, facts)
  if (!def) return null
  // Every operand resolves the same way, computed ones included — they are in
  // `inputs` under the same key `resolveRuleInputs` filed them by.
  const valueOf = (o) => {
    if (!o) return null
    const field = o.field ?? o.literal
    const doc = o.field ? o.doc : 'computed'
    const hit = def.inputs.find((i) => i.field === field && i.doc === doc)
    return { field, doc, value: hit ? hit.value : null, resolved: !!(hit && hit.resolved), confidence: hit ? hit.confidence : null }
  }
  return {
    ...def,
    message: def.message,
    rows: def.rows.map((r, i) => {
      const left = valueOf(r.l)
      const right = valueOf(r.r)
      return {
        op: r.op,
        tol: r.tol,
        left,
        right,
        // Unanswerable beats failed: a row missing an input did not fail, it never ran.
        verdict:
          !left?.resolved || (right && !right.resolved)
            ? 'unanswerable'
            : failedRow === null ? 'pass' : i === failedRow ? 'fail' : 'pass',
      }
    }),
  }
}

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
