// ===========================================================================
// governance — the HTTP adapter.
//
// Base /api/v1/governance. Import endpoints are deliberately absent: that
// feature is future work, and a stub that resolves would make the UI look like
// it works.
// ===========================================================================

import { api } from '@shared/lib/apiClient.js'

const base = '/governance'

/**
 * Everything the module renders from.
 *
 * One request rather than eight. The sections are navigated between constantly —
 * checks to dictionary to library and back — and eight round trips on first paint
 * to render a page that then needs none is the wrong trade for a catalogue this
 * size. It is re-fetched after a write that changes more than the written thing.
 */
export async function loadAll() {
  return api.get(`${base}/bootstrap`)
}

// --- Checks ---------------------------------------------------------------
export const saveCheck = (check) => api.patch(`${base}/checks/${encodeURIComponent(check.id)}`, check)
export const createCheck = (check) => api.post(`${base}/checks`, check)
export const deleteCheck = (id) => api.del(`${base}/checks/${encodeURIComponent(id)}`)
export const saveCheckRule = (id, rule) => api.patch(`${base}/checks/${encodeURIComponent(id)}/rule`, rule)

/**
 * Turns a hard check on or off.
 *
 * Its own endpoint rather than a field on the check, because eligibility is
 * derived server-side from the dictionary — whether every operand reads a
 * document available before the presentation — and the service answers with
 * `{ eligible, why }`. The UI shows the reason on a disabled control; an author
 * who wants a gate needs to know what would make one.
 */
export const setGate = (id, on, onFail) =>
  api.post(`${base}/checks/${encodeURIComponent(id)}/gate`, { on, onFail })

// --- Agents ---------------------------------------------------------------
export const saveAgent = (agent) => api.patch(`${base}/agents/${encodeURIComponent(agent.id)}`, agent)
export const createAgent = (agent) => api.post(`${base}/agents`, agent)
export const deleteAgent = (id) => api.del(`${base}/agents/${encodeURIComponent(id)}`)
export const saveGroup = (group) =>
  api.patch(`${base}/agents/${encodeURIComponent(group.agentId)}/groups/${encodeURIComponent(group.gid)}`, group)

// --- Dictionary -----------------------------------------------------------
export const saveField = (field) =>
  api.patch(`${base}/dictionary/fields/${encodeURIComponent(field.key ?? field.name)}`, field)
export const deleteField = (key) => api.del(`${base}/dictionary/fields/${encodeURIComponent(key)}`)
export const saveDocType = (docType) =>
  api.patch(`${base}/dictionary/doc-types/${encodeURIComponent(docType.code ?? docType.key)}`, docType)
export const deleteDocType = (code) => api.del(`${base}/dictionary/doc-types/${encodeURIComponent(code)}`)

// --- Library --------------------------------------------------------------
export const saveBook = (book) => api.patch(`${base}/library/books/${encodeURIComponent(book.id)}`, book)
export const saveArticle = (article) =>
  api.patch(`${base}/library/articles/${encodeURIComponent(article.id ?? article.aid)}`, article)
export const deleteArticle = (id) => api.del(`${base}/library/articles/${encodeURIComponent(id)}`)

// --- Comments -------------------------------------------------------------
export const addComment = (comment) => api.post(`${base}/comments`, comment)

// --- Model prices (infra; not part of the governance catalogue bootstrap) ---
const pricesBase = '/infra/prices'
export const loadPrices = () => api.get(pricesBase)
export const savePrice = (price) =>
  api.put(`${pricesBase}/${encodeURIComponent(price.family)}`, price)
export const deletePrice = (family) =>
  api.del(`${pricesBase}/${encodeURIComponent(family)}`)
