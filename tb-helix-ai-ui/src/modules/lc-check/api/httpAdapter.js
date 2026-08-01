// ===========================================================================
// lc-check — the HTTP adapter.
//
// The same signatures as the mock, against tb-helix-ai-svc. Screens do not know
// which is behind them, which is what the seam was for.
//
// Endpoints follow the plan's surface (base /api/v1):
//   GET    /lc-check/cases?scope=
//   POST   /lc-check/cases                       multipart: credit + bundle
//   GET    /lc-check/cases/{id}
//   GET    /lc-check/cases/{id}/stream           SSE
//   POST   /lc-check/cases/{id}/stages/{stage}/run
//   POST   /lc-check/cases/{id}/findings/{fid}/outcome
//   DELETE /lc-check/cases/{id}/findings/{fid}/outcome
//   POST   /lc-check/cases/{id}/checks
//   POST   /lc-check/cases/{id}/signoff
//   POST   /lc-check/cases/{id}/ask
//   GET    /lc-check/metrics/spend?period=
// ===========================================================================

import { api } from '@shared/lib/apiClient.js'

const base = '/lc-check'

export async function listCases({ scope = 'all' } = {}) {
  return api.get(`${base}/cases?scope=${encodeURIComponent(scope)}`)
}

/**
 * The pipeline: every stage, its steps, and who starts each one.
 *
 * Not per-case — this is the process, not one run of it. The service builds it
 * from the stage declarations themselves, so it cannot disagree with what runs.
 */
export async function getPipeline() {
  return api.get(`${base}/pipeline`)
}

export async function getCase(caseId) {
  return api.get(`${base}/cases/${encodeURIComponent(caseId)}`)
}

/**
 * Opens a case from two uploaded files.
 *
 * Returns as soon as the service has the bytes on disk — it does not wait for the
 * credit to be read or a scan to be converted. Those happen on the workbench and
 * report themselves over `watchCase`, which is why this is quick enough to hold a
 * dialog open for.
 *
 * The parts must be real `File`s. Appending a string puts a form *field* on the
 * wire rather than a file part, which Spring binds to nothing — the case is
 * created holding neither document and every screen after it has nothing to show.
 */
export async function createCase({ creditFile, bundleFile }) {
  const form = new FormData()
  if (creditFile) form.append('credit', creditFile)
  if (bundleFile) form.append('bundle', bundleFile)
  return api.post(`${base}/cases`, form)
}

export async function peekCredit(creditFile) {
  const form = new FormData()
  if (creditFile) form.append('credit', creditFile)
  return api.post(`${base}/cases/peek`, form)
}

/**
 * Watches a case, whether or not this browser started what it is doing.
 *
 * Separate from `runPipelineStep`, which owns the stream for a run the officer
 * pressed a button for. This one is for work already in flight: intake begins the
 * moment the files land, and a workbench that only listened while *it* was
 * running would show an empty case for the whole of it.
 *
 * Returns an unsubscribe.
 */
export function watchCase(caseId, onEvent) {
  return api.stream(`${base}/cases/${encodeURIComponent(caseId)}/stream`, onEvent)
}

/**
 * Everything this case has reported, in order.
 *
 * The same rows the stream delivers — `{seq, type, at, ...}` — so the run log
 * fills from here and continues from the stream without two shapes of event.
 */
export async function getEvents(caseId, { after = 0 } = {}) {
  return api.get(`${base}/cases/${encodeURIComponent(caseId)}/events?after=${after}`)
}

/** What this case spent, per step and model. Priced by the service. */
export async function getSpend(caseId) {
  return api.get(`${base}/cases/${encodeURIComponent(caseId)}/spend`)
}

/**
 * What every examination has spent lately, from the call ledger.
 *
 * Fewer numbers than the fixture it replaces, and deliberately. The ledger knows
 * what was asked of a model and what it cost; it does not know how many checks
 * ran or how many were settled without one — those are examination facts, and
 * inventing them here to fill a panel is how a made-up figure ends up being acted
 * on. What is missing is missing.
 */
export async function getSpendSummary({ period = '30d' } = {}) {
  const raw = await api.get(`${base}/metrics/spend?period=${encodeURIComponent(period)}`)
  const pages = raw.totalPages || 0
  const cases = raw.casesExamined || 0
  const ran = raw.checksRun || 0
  const free = raw.checksFree || 0
  const totalCost = Number(raw.cost) || 0
  const byModel = (raw.byModel ?? []).map((m) => {
    const cost = Number(m.cost) || 0
    return {
      modelId: m.modelId,
      model: m.modelId,
      label: m.label,
      calls: m.calls || 0,
      billed: m.billed || 0,
      cached: m.cached || 0,
      cases: m.cases,
      tokens: (m.tokensIn || 0) + (m.tokensOut || 0),
      seconds: m.seconds,
      cost,
      costAvoided: Number(m.costAvoided) || 0,
      costShare: 0,
    }
  })
  for (const m of byModel) {
    m.costShare = totalCost ? m.cost / totalCost : 0
  }
  return {
    totalCost,
    casesExamined: cases,
    avgCostPerCase: Number(raw.costPerCase) || 0,
    avgCostPerPage: pages ? totalCost / pages : 0,
    totalPages: pages,
    checksRun: ran,
    findingsRaised: raw.findingsRaised || 0,
    medianWallClock: raw.medianWallClock || 0,
    // Cards settled by comparison rather than by asking a model — per case, and as
    // a share. The whole return on the exact/judged split, in one number.
    cardsPerCase: cases ? Math.round(ran / cases) : 0,
    freeCardsPerCase: cases ? Math.round(free / cases) : 0,
    freeCardPct: ran ? Math.round((free / ran) * 100) : 0,
    costAvoided: Number(raw.costAvoided) || 0,
    calls: raw.calls || 0,
    billed: raw.billed || 0,
    // Share of attempts answered from the derivation cache — not provider prompt-cache %.
    cachedInputPct: raw.cachedPct || 0,
    byModel,
  }
}

export async function addCheck(caseId, { name }) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/checks`, { name })
}

/**
 * The officer overruling the engine on one finding.
 *
 * A POST rather than a PUT on the finding, and the finding's own outcome is never
 * touched: the machine's value and the officer's are two slots, and the file has to
 * be able to show both. The service appends this to `lc_officer_action`.
 */
export async function recordOverride(caseId, findingId, { outcome, by, note }) {
  return api.post(
    `${base}/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(findingId)}/outcome`,
    { outcome, by, note: note ?? null },
  )
}

/** Withdrawing an override. Also an append — the earlier call stays in the file. */
export async function clearOverride(caseId, findingId) {
  return api.del(
    `${base}/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(findingId)}/outcome`,
  )
}

/**
 * Release a hard check's halt so the examination can go on.
 *
 * The finding it raised stays: the officer is taking the ground on themselves,
 * not saying the gate was wrong.
 */
export async function overrideGate(caseId, { note } = {}) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/gate/override`, { note: note ?? null })
}

/**
 * Who presses next on this case — auto or step.
 *
 * A PUT rather than part of a run, because it is a standing decision about how this
 * examination is conducted, taken before a run and outliving it.
 */
export async function setRunMode(caseId, mode) {
  return api.put(`${base}/cases/${caseId}/mode`, { mode })
}

export async function submitCase(caseId, { status, note }) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/signoff`, { status, note })
}

export async function ask(caseId, question) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/ask`, { question })
}

/**
 * Runs one pipeline step and reports progress over SSE.
 *
 * Same contract as the mock: fire the POST, forward events, return an
 * unsubscribe. The caller still owns run mode — whether the officer is stepping
 * or running straight through is a question about who asks for the next step,
 * and it is not the transport's business.
 *
 * The stream is opened *before* the POST. A run that finishes quickly — every
 * step a cache hit, which is the common case on a re-presented bundle — would
 * otherwise emit `stage_done` into a stream nobody had subscribed to yet, and the
 * UI would sit on a spinner for work that was already finished.
 */
export function runPipelineStep(caseId, stepId, _plan, onEvent) {
  const id = encodeURIComponent(caseId)

  const unsubscribe = api.stream(`${base}/cases/${id}/stream`, (event) => {
    onEvent(event)
  })

  api.post(`${base}/cases/${id}/stages/${encodeURIComponent(stepId)}/run`, {}).catch((error) => {
    // 409 already_running is the service refusing a duplicate trigger — same
    // outcome as a failed start from the workbench's point of view.
    onEvent({ type: 'stage_failed', stepId, message: error.message })
    unsubscribe()
  })

  return unsubscribe
}
