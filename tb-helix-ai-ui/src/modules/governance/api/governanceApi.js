// ===========================================================================
// governance — data access.
//
// The seam lc-check already had and this module did not: `store.js` imported
// seed.json directly, so there was nowhere to put a backend.
//
// Same two-adapter shape and the same rule: mock is the default, and a function
// with no `api` entry keeps using it. Governance is CRUD, so it migrates
// endpoint by endpoint — checks before agents before the library — and each one
// that lands is a line moved here rather than a change to any section.
//
// The load is synchronous in the mock and asynchronous over HTTP, so `loadAll`
// is the single async entry point the store awaits once; every mutator after
// that is fire-and-reconcile. That keeps the store's shape — one state object
// re-derived per render — intact under both sources.
// ===========================================================================

import { pick, isApi } from '@shared/lib/dataSource.js'
import * as mock from './mockAdapter.js'
import * as http from './httpAdapter.js'

/** Everything the module needs to render, in one call. */
export const loadAll = pick(mock.loadAll, http.loadAll)

// --- Checks ---------------------------------------------------------------
export const saveCheck = pick(mock.saveCheck, http.saveCheck)
export const createCheck = pick(mock.createCheck, http.createCheck)
export const deleteCheck = pick(mock.deleteCheck, http.deleteCheck)
export const saveCheckRule = pick(mock.saveCheckRule, http.saveCheckRule)
export const setGate = pick(mock.setGate, http.setGate)
export const tryExpression = pick(mock.tryExpression, http.tryExpression)

// --- Agents ---------------------------------------------------------------
export const saveAgent = pick(mock.saveAgent, http.saveAgent)
export const createAgent = pick(mock.createAgent, http.createAgent)
export const deleteAgent = pick(mock.deleteAgent, http.deleteAgent)
export const saveGroup = pick(mock.saveGroup, http.saveGroup)

// --- Dictionary -----------------------------------------------------------
export const saveField = pick(mock.saveField, http.saveField)
export const deleteField = pick(mock.deleteField, http.deleteField)
export const saveDocType = pick(mock.saveDocType, http.saveDocType)
export const deleteDocType = pick(mock.deleteDocType, http.deleteDocType)

// --- Library --------------------------------------------------------------
export const saveBook = pick(mock.saveBook, http.saveBook)
export const saveArticle = pick(mock.saveArticle, http.saveArticle)
export const deleteArticle = pick(mock.deleteArticle, http.deleteArticle)

// --- Comments -------------------------------------------------------------
export const addComment = pick(mock.addComment, http.addComment)

// --- Model prices (infra book; hosted under Governance for convenience) ----
export const loadPrices = pick(mock.loadPrices, http.loadPrices)
export const savePrice = pick(mock.savePrice, http.savePrice)
export const deletePrice = pick(mock.deletePrice, http.deletePrice)

/**
 * Whether writes actually persist.
 *
 * The store shows an "unsaved — this session only" marker under mock, because a
 * Save button that quietly discards an afternoon's authoring is the worst kind
 * of lie a form can tell.
 */
export const persists = isApi
