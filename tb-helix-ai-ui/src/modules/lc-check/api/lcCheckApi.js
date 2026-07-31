// ===========================================================================
// lc-check — data access.
//
// The single seam between the module and its data. Screens call these functions
// and nothing else; they never import fixtures.
//
// Two implementations sit behind it, chosen by VITE_DATA_SOURCE:
//
//   mock (default)  ../data fixtures — demos, layout review, exact reproduction
//   api             tb-helix-ai-svc on :9090
//
// Per-function rather than per-module on purpose. The backend arrives one
// endpoint at a time, and a function with no `api` entry below simply keeps
// using the mock — so a half-migrated module is a working module rather than a
// broken one. Move a line when its endpoint is real.
// ===========================================================================

import { pick } from '@shared/lib/dataSource.js'
import * as mock from './mockAdapter.js'
import * as http from './httpAdapter.js'

export const listCases = pick(mock.listCases, http.listCases)
export const getPipeline = pick(mock.getPipeline, http.getPipeline)
export const getCase = pick(mock.getCase, http.getCase)
export const createCase = pick(mock.createCase, http.createCase)
export const peekCredit = pick(mock.peekCredit, http.peekCredit)
export const addCheck = pick(mock.addCheck, http.addCheck)
export const recordDecision = pick(mock.recordDecision, http.recordDecision)
export const submitCase = pick(mock.submitCase, http.submitCase)
export const runPipelineStep = pick(mock.runPipelineStep, http.runPipelineStep)
export const watchCase = pick(mock.watchCase, http.watchCase)
export const getEvents = pick(mock.getEvents, http.getEvents)
export const getSpend = pick(mock.getSpend, http.getSpend)

// Mock in both modes, still — and this one is not for want of an endpoint.
// GET /lc-check/metrics/spend is real and returns the ledger's totals, but
// SpendPanel asks for `checksRun`, `freeCardPct`, `cardsPerCase` and
// `costAvoided`, which are examination facts a call ledger does not hold. Pointing
// it at the service today would render half a panel of NaN, which is worse than a
// fixture because it looks like a measurement. Move this line when the panel has
// been reduced to what can actually be answered.
export const getSpendSummary = pick(mock.getSpendSummary)
export const ask = pick(mock.ask)
