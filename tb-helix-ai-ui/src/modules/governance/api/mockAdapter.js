// ===========================================================================
// governance — the mock adapter.
//
// seed.json, behind the signatures the HTTP adapter implements. Writes are
// no-ops that resolve: the store already holds every edit in memory and re-derives
// the view from it, so persistence is the only thing missing, and pretending to
// persist is exactly what this should do until the backend does.
//
// The same seed file is the backend's first-boot seed, so both sources start
// from one description of the world rather than two that drift.
// ===========================================================================

import seed from '../data/seed.json'

const LATENCY = { load: 120, mutate: 60 }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * Everything the module renders from, in one call.
 *
 * Shaped as the service will return it rather than as seed.json happens to be
 * laid out — so switching source is not a reshaping exercise in the store.
 */
export async function loadAll() {
  await wait(LATENCY.load)
  return clone({
    checks: seed.checks,
    checkDefaults: seed.checkDefaults,
    ruleSeeds: seed.ruleSeeds,
    agents: seed.agents,
    groups: seed.groups,
    fields: seed.fields,
    docTypes: seed.docTypes,
    refBook: seed.refBook,
    articleInfo: seed.articleInfo,
    comments: seed.comments,
    phases: seed.phases,
  })
}

// Writes resolve without doing anything. The store is the source of truth for an
// unsaved session; these exist so the call sites are identical under both sources.
const accept = async (value) => {
  await wait(LATENCY.mutate)
  return value ?? null
}

export const saveCheck = (check) => accept(check)
export const createCheck = (check) => accept(check)
export const deleteCheck = (id) => accept({ id })
export const saveCheckRule = (id, rule) => accept(rule)
export const setGate = (id, on) => accept({ id, gate: on })

export const saveAgent = (agent) => accept(agent)
export const createAgent = (agent) => accept(agent)
export const deleteAgent = (id) => accept({ id })
export const saveGroup = (group) => accept(group)

export const saveField = (field) => accept(field)
export const deleteField = (key) => accept({ key })
export const saveDocType = (docType) => accept(docType)
export const deleteDocType = (code) => accept({ code })

export const saveBook = (book) => accept(book)
export const saveArticle = (article) => accept(article)
export const deleteArticle = (id) => accept({ id })

export const addComment = (comment) => accept(comment)
