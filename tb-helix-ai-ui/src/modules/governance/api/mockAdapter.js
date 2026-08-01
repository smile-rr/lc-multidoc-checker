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
export const setGate = (id, on, onFail) => accept({ id, gate: on, onFail })

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

// In-memory price book for mock sessions. Mirrors a few seeded families so the
// Models tab is usable offline; not shared with spend accounting. Flat rates only.
let mockPrices = [
  {
    family: 'qwen-flash', label: 'Qwen Flash', vendor: 'alibaba', tier: 'economy',
    inPerMillion: 0.25, outPerMillion: 1.5, cachedInPerMillion: null,
    patterns: ['qwen3.7-flash', 'qwen-flash', 'qwen3.7-vl-flash', 'qwen-vl-flash'],
    note: 'Text and vision flash ids share this family.', quotedOn: '2026-07-31',
    bands: [],
  },
  {
    family: 'qwen-plus', label: 'Qwen Plus', vendor: 'alibaba', tier: 'balanced',
    inPerMillion: 0.4, outPerMillion: 1.6, cachedInPerMillion: null,
    patterns: ['qwen3.7-plus', 'qwen-plus', 'qwen-vl-plus'],
    note: null, quotedOn: '2026-07-31',
    bands: [],
  },
  {
    family: 'deepseek-flash', label: 'DeepSeek Flash', vendor: 'deepseek', tier: 'economy',
    inPerMillion: 0.14, outPerMillion: 0.28, cachedInPerMillion: 0.0028,
    patterns: ['deepseek-v4-flash', 'deepseek-chat'], note: null, quotedOn: '2026-07-31',
    bands: [],
  },
]

export async function loadPrices() {
  await wait(LATENCY.load)
  return clone(mockPrices)
}

export async function savePrice(price) {
  await wait(LATENCY.mutate)
  const next = clone(price)
  const i = mockPrices.findIndex((p) => p.family === next.family)
  if (i >= 0) mockPrices[i] = next
  else mockPrices = [next, ...mockPrices]
  return { family: next.family, saved: true }
}

export async function deletePrice(family) {
  await wait(LATENCY.mutate)
  mockPrices = mockPrices.filter((p) => p.family !== family)
  return { deleted: family }
}
