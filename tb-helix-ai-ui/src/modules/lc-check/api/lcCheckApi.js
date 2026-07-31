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

// Mock in both modes, and deliberately — the service has no endpoint behind
// either yet, and routing them to a 404 would put a toast on the cases list every
// time it loads. This is the per-function seam doing its job: move the line when
// the endpoint is real.
export const getSpendSummary = pick(mock.getSpendSummary)
export const ask = pick(mock.ask)
