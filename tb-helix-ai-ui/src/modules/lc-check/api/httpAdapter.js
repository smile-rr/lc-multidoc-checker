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
//   POST   /lc-check/cases/{id}/findings/{fid}/decision
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

export async function getSpendSummary({ period = '30d' } = {}) {
  return api.get(`${base}/metrics/spend?period=${encodeURIComponent(period)}`)
}

export async function addCheck(caseId, { name }) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/checks`, { name })
}

export async function recordDecision(caseId, findingId, { disposition, note }) {
  return api.post(
    `${base}/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(findingId)}/decision`,
    { disposition, note },
  )
}

export async function submitCase(caseId, { verdict, note }) {
  return api.post(`${base}/cases/${encodeURIComponent(caseId)}/signoff`, { verdict, note })
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
 * otherwise emit `step_done` into a stream nobody had subscribed to yet, and the
 * UI would sit on a spinner for work that was already finished.
 */
export function runPipelineStep(caseId, stepId, _plan, onEvent) {
  const id = encodeURIComponent(caseId)

  const unsubscribe = api.stream(`${base}/cases/${id}/stream`, (event) => {
    onEvent(event)
  })

  api.post(`${base}/cases/${id}/stages/${encodeURIComponent(stepId)}/run`, {}).catch((error) => {
    // Surfaced as a toast by the client already; the run engine needs to stop
    // waiting for a step that will never report.
    onEvent({ type: 'stage_failed', stepId, message: error.message })
    unsubscribe()
  })

  return unsubscribe
}
