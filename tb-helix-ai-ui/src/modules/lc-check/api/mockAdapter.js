// ===========================================================================
// lc-check — the mock adapter.
//
// The fixtures, behind the same signatures the HTTP adapter implements. Not
// scaffolding to be deleted: this is how the UI is demoed, how a layout is
// reviewed without a database, and how one specific case is reproduced exactly.
// It stays after the backend lands.
//
// Artificial latency is deliberate — loading states that are never exercised are
// loading states that are broken.
// ===========================================================================

import { CASE_LIST, caseDetailFor, ASK_SUGGESTIONS, AI_PERFORMANCE, RUN_STEPS } from '../data/fixtures.js'
import { summariseSpend } from '../state/runCost.js'

/** The pipeline as tb-helix-ai-svc declares it. Mirrors GET /lc-check/pipeline. */
const PIPELINE = [
  { stage: 'intake', auto: true, officerStarts: false, steps: [
    { key: 'credit', label: 'Reading the credit' },
    { key: 'bundle', label: 'Converting the scan to PDF' },
    { key: 'manifest', label: 'Counting the pages' },
    { key: 'ready', label: 'Finishing intake' }] },
  { stage: 'interpret', auto: false, officerStarts: true, steps: [
    { key: 'segment', label: 'Sorting the pages into documents' },
    { key: 'extract', label: 'Reading each document' }] },
  { stage: 'gate', auto: false, officerStarts: false, steps: [
    { key: 'gate', label: 'Running the hard checks' }] },
  { stage: 'plan', auto: false, officerStarts: true, steps: [
    { key: 'select', label: 'Selecting the rules that apply' },
    { key: 'requirements', label: 'Reading what the credit asks for' }] },
  { stage: 'execute', auto: false, officerStarts: true, steps: [
    { key: 'facts', label: 'Assembling what the documents say' },
    { key: 'checks', label: 'Running the planned checks' }] },
  { stage: 'signoff', auto: false, officerStarts: true, steps: [
    { key: 'report', label: 'Drafting the refusal advice' }] },
]

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
/**
 * The pipeline, as the service declares it.
 *
 * Kept in step with `Stage.steps()` on the backend — `pipelineDisagreements` in
 * severity.js shouts if the two drift, which is the whole reason this exists
 * rather than the UI simply believing its own constant.
 *
 * @returns {Promise<object[]>}
 */
export async function getPipeline() {
  await wait(LATENCY.mutate)
  return clone(PIPELINE)
}

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
 * Watches a case for work already in flight.
 *
 * Nothing runs by itself in mock — a fixture is not being read anywhere — so this
 * subscribes to silence and returns the same unsubscribe the real one does. The
 * caller cannot tell, which is the point of the seam.
 *
 * @returns {() => void}
 */
export function watchCase(caseId, onEvent) {
  void [caseId, onEvent]
  return () => {}
}

/**
 * A finished run's tape.
 *
 * Authored rather than generated, and fixed in time rather than relative to now,
 * so the run log renders identically on every load and in the render smoke. It
 * covers what the real tape covers — a stage that halted, a step that was
 * skipped, one answered from cache — because a panel only tested against a happy
 * run is a panel whose interesting states nobody has ever seen.
 *
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getEvents() {
  await wait(LATENCY.read)
  const t0 = Date.parse('2026-07-31T09:14:02Z')
  let seq = 0
  const at = (offsetMs) => new Date(t0 + offsetMs).toISOString()
  const e = (offset, type, rest) => ({ seq: ++seq, type, at: at(offset), ...rest })

  return [
    e(0, 'stage_started', { stage: 'intake' }),
    e(120, 'step_started', { stage: 'intake', step: 'store', label: 'Storing the files' }),
    e(910, 'step_finished', { stage: 'intake', step: 'store', label: '2 files stored', status: 'OK', ms: 790, refresh: true }),
    e(950, 'step_started', { stage: 'intake', step: 'credit', label: 'Reading the credit' }),
    e(7300, 'step_finished', { stage: 'intake', step: 'credit', label: 'Credit read — 18 terms', status: 'OK', ms: 6350, refresh: true }),
    e(7400, 'stage_done', { stage: 'intake', ms: 7400 }),
    e(7420, 'awaiting_officer', { stage: 'intake', next: 'interpret' }),

    e(31000, 'stage_started', { stage: 'interpret' }),
    e(31100, 'step_started', { stage: 'interpret', step: 'segment', label: 'Sorting 6 pages into documents' }),
    e(33000, 'segment', { done: 3, total: 6 }),
    e(35200, 'segment', { done: 6, total: 6 }),
    e(35400, 'step_finished', { stage: 'interpret', step: 'segment', label: '6 documents found', status: 'OK', ms: 4300, refresh: true }),
    e(35500, 'step_started', { stage: 'interpret', step: 'extract', label: 'Reading the commercial invoice' }),
    e(48800, 'step_finished', { stage: 'interpret', step: 'extract', label: '21 fields read', status: 'OK', ms: 13300, refresh: true }),
    e(48900, 'step_started', { stage: 'interpret', step: 'extract', label: 'Reading the bill of lading' }),
    e(49100, 'cache_hit', { stage: 'interpret', step: 'extract' }),
    e(49300, 'step_finished', { stage: 'interpret', step: 'extract', label: '27 fields read', status: 'OK', ms: 400, refresh: true }),
    e(49400, 'stage_done', { stage: 'interpret', ms: 18400 }),
    e(49420, 'awaiting_officer', { stage: 'interpret', next: 'plan' }),

    e(96000, 'stage_started', { stage: 'gate' }),
    e(96100, 'step_started', { stage: 'gate', step: 'gate', label: 'Running 1 hard check' }),
    e(96450, 'step_finished', { stage: 'gate', step: 'gate', label: 'DATE-31D failed', status: 'HALTED', ms: 350, refresh: true }),
    e(96500, 'gate_halted', {
      stage: 'gate',
      checkId: 'DATE-31D',
      statement: 'PRESENTATION MADE ON 2026-07-31 AFTER CREDIT EXPIRY 2025-12-31.',
    }),
  ]
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
/** The fixture's ledger — one real call, the rest answered from cache. */
export async function getSpend() {
  await wait(LATENCY.read)
  return [
    { stage: 'intake', step: 'credit', modelId: 'qwen3.7-flash', family: 'qwen-flash', role: 'read_text',
      kind: 'TEXT', calls: 1, cached: 0, failed: 0, tokensIn: 1718, tokensOut: 664, tokensCached: 0, ms: 4956, cost: 0.000351 },
    { stage: 'interpret', step: 'segment', modelId: 'qwen3.7-flash', family: 'qwen-flash', role: 'segment',
      kind: 'VISION', calls: 1, cached: 1, failed: 0, tokensIn: 0, tokensOut: 0, tokensCached: 0, ms: 0, cost: 0 },
  ]
}

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
/** No gate halts in the fixtures, so there is nothing to release. */
export async function overrideGate() {
  return { overridden: true }
}

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
 * Runs one pipeline step, emitting progress the same way the service's SSE
 * stream will. Returns an unsubscribe function; call it to stop a step in
 * flight.
 *
 * This knows nothing about run mode. Whether the officer is running straight
 * through or a stage at a time is a decision about who asks for the next step,
 * and belongs to the caller — putting it here once meant the transport decided
 * how much of the pipeline ran, which is not the transport's business.
 *
 * Events:
 *   interpret  { type: 'segment', done, total } ×n, then { type: 'stage_done' }
 *   plan       { type: 'stage_done' }
 *   execute    { type: 'area_started'|'area_done', areaId } ×n, then { type: 'stage_done' }
 *
 * @param {string} caseId
 * @param {'interpret'|'plan'|'execute'} stepId
 * @param {{ areas: import('../data/contracts.js').CheckArea[], segmentTotal: number }} plan
 * @param {(event: object) => void} onEvent
 * @returns {() => void} unsubscribe
 */
export function runPipelineStep(caseId, stepId, { areas = [], segmentTotal = 6 }, onEvent) {
  void caseId
  const timers = []
  const at = (ms, fn) => timers.push(setTimeout(fn, ms))
  const done = (ms) => at(ms, () => onEvent({ type: 'stage_done', stage: stepId }))

  // Paced so a run reads as work happening without making a demo wait.
  const SEGMENT_EVERY = 130
  const AREA_EVERY = 800
  const PLAN_MS = 900

  if (stepId === 'interpret') {
    for (let i = 1; i <= segmentTotal; i += 1) {
      at(i * SEGMENT_EVERY, () => onEvent({ type: 'segment', done: i, total: segmentTotal }))
    }
    done(segmentTotal * SEGMENT_EVERY + 160)
  } else if (stepId === 'plan') {
    done(PLAN_MS)
  } else if (stepId === 'execute') {
    areas.forEach((area, i) => {
      at(i * AREA_EVERY + 120, () => onEvent({ type: 'area_started', areaId: area.id }))
      at((i + 1) * AREA_EVERY, () => onEvent({ type: 'area_done', areaId: area.id }))
    })
    done(areas.length * AREA_EVERY + 160)
  }

  return () => timers.forEach(clearTimeout)
}

// Small stable hash so a generated check id is deterministic for a given name.
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
