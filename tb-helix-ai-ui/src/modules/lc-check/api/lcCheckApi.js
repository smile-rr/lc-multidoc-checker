// ===========================================================================
// lc-check — data access.
//
// The single seam between the module and its data. Screens call these functions
// and nothing else; they never import fixtures. Every call is async and returns
// contract shapes, so pointing this file at lc-checker-v2-svc is a rewrite of
// the bodies only — no screen changes, no prop changes.
//
// The real endpoints these stand in for (base `/api/v2`, proxied in dev):
//   listCases        GET    /sessions
//   getCase          GET    /sessions/{id}
//   createCase       POST   /sessions                     (multipart: credit + bundle)
//   runStage         POST   /sessions/{id}/stages/{stage}/run
//   recordDecision   POST   /sessions/{id}/findings/{fid}/decision
//   addCheck         POST   /sessions/{id}/checks
//   submitCase       POST   /sessions/{id}/signoff
//   ask              POST   /sessions/{id}/ask
//   getSpend         GET    /metrics/spend?period=30d
//
// The bundle PDF is served today from `public/samples/`; against the service it
// becomes `GET /sessions/{id}/documents/{docId}/pdf`. `CaseDetail.pdfUrl` is the
// only place that changes.
//
// Stage progress arrives over SSE in the real service (`/sessions/{id}/stream`).
// `subscribeToRun` below has the same callback shape an EventSource wrapper will
// have, so the run engine does not care which is behind it.
// ===========================================================================

import { CASE_LIST, caseDetailFor, ASK_SUGGESTIONS, AI_PERFORMANCE, RUN_STEPS } from '../data/fixtures.js'
import { summariseSpend } from '../state/runCost.js'

/** Simulated service latency, ms. Kept visible so loading states get exercised. */
const LATENCY = { list: 160, detail: 220, mutate: 110 }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Deep clone on the way out so a screen mutating a result cannot corrupt the
// fixture — the same isolation a real HTTP response gives you for free.
const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * @param {{ scope?: 'all'|'mine'|'due' }} [params]
 * @returns {Promise<import('../data/contracts.js').CaseSummary[]>}
 */
export async function listCases({ scope = 'all' } = {}) {
  await wait(LATENCY.list)
  const rows = clone(CASE_LIST)
  if (scope === 'mine') return rows.filter((r) => r.mine)
  if (scope === 'due') return rows.filter((r) => r.replyDueDays === 0)
  return rows
}

/**
 * @param {string} caseId
 * @returns {Promise<import('../data/contracts.js').CaseDetail>}
 */
export async function getCase(caseId) {
  await wait(LATENCY.detail)
  const detail = caseDetailFor(caseId)
  if (!detail) throw new Error(`No such case: ${caseId}`)
  return detail
}

/**
 * Opens a case from an uploaded credit and presentation bundle.
 * @param {{ creditFile: string, bundleFile: string }} files
 * @returns {Promise<{ caseId: string }>}
 */
export async function createCase(files) {
  await wait(LATENCY.mutate)
  void files
  // A new case starts unexamined — the fresh fixture.
  return { caseId: 'CHK-25-0128-011' }
}

/**
 * What the credit tells us before a case exists — shown in the New check dialog
 * as soon as the MT700 is dropped.
 * @returns {Promise<{ label: string, value: string }[]>}
 */
export async function peekCredit() {
  await wait(LATENCY.mutate)
  const detail = caseDetailFor('CHK-25-0128-011')
  const c = detail.credit
  return [
    { label: 'Check', value: detail.id },
    { label: 'Credit', value: `${c.creditRef} · expires ${c.expiry}` },
    { label: 'Amount', value: `${c.currency} ${c.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}${c.tolerancePct ? ` ±${c.tolerancePct}%` : ''}` },
    { label: 'Beneficiary', value: c.beneficiary },
  ]
}

/**
 * Portfolio AI spend, for the cases list.
 *
 * Aggregated server-side in production — the browser must not have to pull every
 * case to add up a number.
 *
 * @returns {Promise<object>}
 */
export async function getSpendSummary() {
  await wait(LATENCY.list)
  const cases = CASE_LIST.map((c) => ({
    id: c.id,
    pageCount: c.pageCount,
    // Only examined cases have spent anything.
    examined: c.status !== 'awaiting_check',
  }))
  // Work completed ahead of review — the concrete output of the pre-check.
  const done = cases.filter((c) => c.examined).map((c) => caseDetailFor(c.id))
  const checksRun = done.reduce((a, d) => a + d.checks.filter((c) => c.areaId).length, 0)
  const findingsRaised = done.reduce((a, d) => a + d.findings.length, 0)

  return {
    ...summariseSpend(cases, RUN_STEPS),
    checksRun,
    findingsRaised,
    benchmark: AI_PERFORMANCE,
  }
}

/**
 * Adds an officer-authored check to a case's plan. Recorded against their name.
 * @param {string} caseId
 * @param {{ name: string }} check
 * @returns {Promise<import('../data/contracts.js').PlanCheck>}
 */
export async function addCheck(caseId, { name }) {
  await wait(LATENCY.mutate)
  void caseId
  return {
    id: `USER-${String((Math.abs(hash(name)) % 89) + 1).padStart(2, '0')}`,
    name,
    areaId: null,
    appliesBecause: 'You added it to this case',
    ruleRef: 'Your judgement — recorded against your name',
    findingId: null,
    addedByOfficer: true,
  }
}

/**
 * @param {string} caseId
 * @param {string} findingId
 * @param {{ disposition: import('../data/contracts.js').Disposition, note?: string }} decision
 */
export async function recordDecision(caseId, findingId, decision) {
  await wait(LATENCY.mutate)
  void [caseId, findingId, decision]
}

/**
 * @param {string} caseId
 * @param {{ verdict: import('../data/contracts.js').Verdict, note: string }} signoff
 * @returns {Promise<{ routedTo: string }>}
 */
export async function submitCase(caseId, signoff) {
  await wait(LATENCY.mutate)
  void signoff
  return { routedTo: caseDetailFor(caseId)?.authoriser ?? 'the checker' }
}

/**
 * @param {string} caseId
 * @param {string} question
 * @returns {Promise<{ answer: string }>}
 */
export async function ask(caseId, question) {
  await wait(LATENCY.detail)
  void caseId
  const hit = ASK_SUGGESTIONS.find((s) => s.label === question)
  return {
    answer:
      hit?.answer ??
      'I can only answer from what is in this presentation and the rule books behind the checks. Ask about a finding, whether something can be cured, or what a rule says.',
  }
}

// ---- Run progress ----------------------------------------------------------

/**
 * Drives a review run, emitting progress the same way the service's SSE stream
 * will. Returns an unsubscribe function; call it to stop a run in flight.
 *
 * Events, in order:
 *   { type: 'segment', done, total }     intake carving the bundle into documents
 *   { type: 'area_started', areaId }
 *   { type: 'area_done', areaId }
 *   { type: 'finished' }
 *
 * @param {string} caseId
 * @param {{ areas: import('../data/contracts.js').CheckArea[], mode: 'auto'|'step', segmentTotal: number }} plan
 * @param {(event: object) => void} onEvent
 * @returns {() => void} unsubscribe
 */
export function subscribeToRun(caseId, { areas, mode, segmentTotal = 6 }, onEvent) {
  void caseId
  const timers = []
  const at = (ms, fn) => timers.push(setTimeout(fn, ms))

  const SEGMENT_EVERY = 130
  // Paced so a full run reads as work happening without making a demo wait.
  const AREA_EVERY = 800

  for (let i = 1; i <= segmentTotal; i += 1) {
    at(i * SEGMENT_EVERY, () => onEvent({ type: 'segment', done: i, total: segmentTotal }))
  }

  // In step mode the caller advances one area at a time, so only segmentation is
  // scheduled up front.
  if (mode === 'auto') {
    const offset = segmentTotal * SEGMENT_EVERY
    areas.forEach((area, i) => {
      at(offset + i * AREA_EVERY + 120, () => onEvent({ type: 'area_started', areaId: area.id }))
      at(offset + (i + 1) * AREA_EVERY, () => onEvent({ type: 'area_done', areaId: area.id }))
    })
    at(offset + areas.length * AREA_EVERY + 160, () => onEvent({ type: 'finished' }))
  }

  return () => timers.forEach(clearTimeout)
}

// Small stable hash so a generated check id is deterministic for a given name.
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
