// ============================================================================
// store.js — LC Governance Console state + view-model derivation.
//
// Ported from the claude.ai/design prototype "LC Governance Console.dc.html"
// (DCLogic class). Seed data, the check view-model builder (buildCheck) and the
// per-render derivation (deriveVals) are kept faithful to the design so the
// React components map 1:1 onto the original markup. All data is in-memory mock
// data — the backend service is wired in later.
// ============================================================================

import { focusItem } from '@shared/lib/useNewItemFocus'
import { isBlank, allPresent } from '@shared/ds/TextField'
import seed from './data/seed.json' with { type: 'json' }
import { hydrateSeed } from './api/hydrate'
import * as gov from './api/governanceApi'
import { AGENT_LINK } from './features'

// Fills `seed` in place from the service, before anything below reads it.
//
// In place, because the constants under this line bind parts of the seed at
// import and are read from a hundred call sites; refilling the arrays keeps
// every one of those references valid. Called by GovernanceModule before its
// first render, so the store never sees a half-loaded catalogue.
export function loadCatalog(data) {
  hydrateSeed(seed, data)
}

// Writing an authored check back.
//
// Fire and forget: the store is already the source of truth for the session, and
// blocking the edit slot on a round trip would make saving feel like submitting a
// form. A failure surfaces as a toast through apiClient's `api-error` event —
// which is the same path every other failure in the app takes.
// What the service works out for itself, and must not be told.
//
// Every one of these is derived from the document or from the rest of the
// catalogue — a check's tier from its type, its gate eligibility from its own
// operands against the dictionary, its comment count from the comments. Storing a
// copy would freeze an answer that goes stale the moment anything else moves.
const DERIVED = new Set([
  'tier', 'gateEligible', 'gateOn', 'hasConditions', 'operandDocs', 'commentCount',
  'usedByChecks', 'boundFields',
])

/**
 * The document, as it is stored.
 *
 * A deny-list, and the direction matters. An allow-list — the hand-written payload
 * this replaces — has to be edited every time the console learns a new property, and
 * the edit that gets forgotten silently drops it: that list named thirteen fields and
 * quietly discarded `suggestion`, which the seed had been carrying all along. A
 * deny-list is edited only when the service starts deriving something new, which is
 * rare and which the person doing it is already thinking about.
 *
 * So: send what the console holds, minus what the service computes. Adding a property
 * to a check is now an edit in one place.
 */
const stored = (doc) =>
  Object.fromEntries(Object.entries(doc).filter(([k, v]) => !DERIVED.has(k) && v !== undefined))

function persistCheck(check, rule) {
  const payload = {
    ...stored(check),
    // Retired is the only lifecycle there is. There is no draft and no version in
    // this design — pressing Save is the whole ceremony — so a check either runs or
    // has been stood down, and nothing else is stored.
    status: check.inactive ? 'RETIRED' : 'ACTIVE',
  }
  delete payload.inactive

  // The rule travels with the check. They were two calls against two tables, which
  // meant a check could be saved without the conditions that make it mean anything
  // and look complete. Sent even when unchanged, because saving it is what
  // recomputes gate eligibility from its operands.
  if (rule && rule.groups) {
    payload.rule = { scope: rule.scope ?? '', message: rule.message ?? '', groups: rule.groups }
  }
  gov.saveCheck(payload).catch(() => {})
}

/**
 * A dictionary field, with the documents it is read from.
 *
 * The bindings travel with it — which documents carry this field, the note saying how
 * to read it there, and any aliases that document uses instead of the dictionary's
 * name. They were dropped on the floor for a while by a store that named six columns
 * and forgot the seventh.
 */
function persistField(f) {
  gov.saveField({
    ...stored(f),
    name: (f.name || '').trim(),
    description: (f.description || '').trim(),
    bindings: (f.bindings || []).map((b) => ({ ...b, note: (b.note || '').trim() })),
  }).catch(() => {})
}

function persistDocType(d) {
  gov.saveDocType({
    ...stored(d),
    key: (d.key || '').trim(),
    name: (d.name || '').trim(),
    description: (d.description || '').trim(),
  }).catch(() => {})
}

const START_SECTION = 'checks'

// ---- Seed: domain agents ---------------------------------------------------
export const AGENTS = seed.agents

export const CHECKS = seed.checks

export const PHASES = seed.phases

export const GROUPS = seed.groups

const SEV_META = {
  CRITICAL: { color: 'var(--status-error)' },
  MAJOR: { color: '#946400' },
  MINOR: { color: 'var(--me-grey-70)' },
}

export const REF_BOOK = seed.refBook
const ARTICLE_INFO = seed.articleInfo
const CHECK_DEFAULTS = seed.checkDefaults
const RULE_SEEDS = seed.ruleSeeds

// ---- The two kinds of check card ------------------------------------------
// A Rule card compares one field against another, deterministically. A
// **Everything authored here is a Rule card.** One catalogue, as the service has it:
// `catalog.yml` holds a single list keyed `rules:`, each entry carrying a
// `check_type`. A rule an agent reads is no less a rule than one comparing two
// fields — both are standing instructions this bank authored and approved, and only
// the evaluation differs. There used to be a second card kind here called
// "Requirement", which collided with what the *credit* requires and had no
// counterpart in the service at all.
//
// So a card carries `checkType`, the service's tier, and the two things the UI needs
// fall out of it:
//
//   TIERS      the four tiers as the service declares them, for the card's detail
//   tierOf     the one bit an officer needs — is the answer reproducible?
export const TIERS = {
  PROGRAMMATIC: { label: 'Programmatic', tier: 'exact', hint: 'An expression over extracted fields. Under 100ms, no model, deterministic.' },
  AGENT: { label: 'Agent', tier: 'judged', hint: 'One structured model call against the presentation. No tools.' },
  AGENT_TOOL: { label: 'Agent + tools', tier: 'judged', hint: 'A model call with date, amount and currency tools. Three calls at most.' },
  AGENTIC: { label: 'Agentic', tier: 'judged', hint: 'A multi-iteration tool-using loop, hard-capped. One rule, many sub-results.' },
}

// Exact or judged — the officer-facing half of the tier. Named for what it says
// about trust rather than "static / dynamic": both are equally static as authored
// artefacts, and the genuinely dynamic thing in this system is a requirement read out
// of a credit's :47A:, which is different on every case.
export const CARD_TYPES = {
  exact: { label: 'Exact', icon: 'equal', color: 'var(--me-blue-deep)', bg: 'var(--me-blue-20)', hint: 'An expression over fields read from the documents. Same answer every time, no model.' },
  judged: { label: 'Judged', icon: 'list-checks', color: '#1F7A00', bg: 'var(--me-green-20)', hint: 'Read against the presentation by an agent, which forms a view. Costs tokens and needs your eye.' },
}
export const checkTypeOf = (c) => (c && TIERS[c.checkType] ? c.checkType : 'AGENT')
export const typeOf = (c) => TIERS[checkTypeOf(c)].tier

// ---- Rule-card vocabulary --------------------------------------------------
// Operators are grouped the way a checker thinks about them, not by data type.
export const OP_GROUPS = [
  { label: 'Text & wording', ops: [{ value: 'eq', label: 'equals' }, { value: 'noconflict', label: 'does not conflict with' }, { value: 'contains', label: 'contains' }, { value: 'oneof', label: 'is one of' }, { value: 'ne', label: 'differs from' }] },
  { label: 'Amounts & quantities', ops: [{ value: 'n_eq', label: 'equals (amount)' }, { value: 'lte', label: 'is at most' }, { value: 'gte', label: 'is at least' }, { value: 'within_pct', label: 'is within tolerance of' }] },
  { label: 'Dates', ops: [{ value: 'd_lte', label: 'is on or before' }, { value: 'd_gte', label: 'is on or after' }, { value: 'd_within', label: 'is within' }, { value: 'd_eq', label: 'is the same date as' }] },
  { label: 'Parties, places & countries', ops: [{ value: 'same_party', label: 'is the same party as' }, { value: 'same_country', label: 'is in the same country as' }, { value: 'addr_same_country', label: 'address agrees (same country is enough)' }] },
  { label: 'Presence & expression', ops: [{ value: 'present', label: 'is stated' }, { value: 'absent', label: 'is not stated' }, { value: 'matches', label: 'satisfies expression' }, { value: 'nmatches', label: 'does not satisfy expression' }] },
]
// Operators that take no right-hand operand, and those whose right side is an
// expression rather than another field.
const UNARY_OPS = ['present', 'absent']
const EXPR_OPS = ['matches', 'nmatches']
const opLabel = (v) => { let out = v; OP_GROUPS.forEach((g) => g.ops.forEach((o) => { if (o.value === v) out = o.label })); return out }

// A block joins the one above it with AND or OR (`connector`); the first block
// has nothing to join to, so it carries none.
const ruleBlank = () => ({ scope: 'Every presentation', message: '', groups: [{ id: 'g1', logic: 'all', rows: [{ id: 'r1', l: {}, r: {}, op: 'eq', tol: '' }] }] })

// Seeds are stored flat (one block of rows); the editor works in bracketed
// blocks. Normalise on read so both shapes render the same.
const normaliseRule = (raw) => {
  if (!raw) return ruleBlank()
  if (raw.groups) return raw
  return { scope: raw.scope, message: raw.message, groups: [{ id: 'g1', logic: raw.logic || 'all', rows: raw.rows || [] }] }
}

const blankRow = () => ({ id: uid('r'), l: {}, r: {}, op: 'eq', tol: '' })

// Run after anything is removed. A block that has lost its last condition is
// gone — an empty bracket means nothing, and leaving one for the author to tidy
// up by hand is work the interface can do itself. A rule always keeps one
// block with one condition, because a rule with nothing to compare is not a
// rule. Whichever block ends up first carries no connector: there is nothing
// above it to join to.
const tidyRule = (ru) => {
  const kept = ru.groups.filter((g) => g.rows.length)
  if (!kept.length) return { ...ru, groups: [{ id: uid('g'), logic: 'all', rows: [blankRow()] }] }
  return { ...ru, groups: kept.map((g, i) => (i === 0 ? { ...g, connector: undefined } : g)) }
}

// What still has to be filled in before this rule can be saved. Each line says
// what to do, not what is wrong.
/**
 * What a check cannot be saved without.
 *
 * The first two apply to both tiers and used to apply to neither: this only ran for
 * exact checks, and only looked at the rule — so a judged check could be saved with an
 * empty body, and a judged check's body IS the prompt. A check that asks nothing runs
 * against every presentation and reports whatever the model makes of a blank
 * instruction.
 */
const checkIssues = (check, rule, isExact) => {
  const out = []
  if (isBlank(check.title)) out.push('Give it a title — it is how this check is read in a finding.')

  // Only a judged check needs a body, and the reason is not taste: an exact check
  // does not show one. The editor renders the body for judged cards alone, so
  // requiring it on both tiers disabled Save on an exact card and pointed at a
  // field that was not on screen — which is the worst thing a form can do.
  //
  // It is also right on the merits. A judged check's body IS the instruction the
  // examiner is given. An exact check says what it means in its conditions, and
  // what it raises in its message, and both are required below.
  if (!isExact) {
    if (isBlank(check.body)) {
      out.push('Write the check — for a judged check this text is the instruction the examiner is given.')
    }
    return out
  }

  const rows = rule.groups.flatMap((g) => g.rows)
  if (!rows.length) out.push('Add a condition.')
  const side = (o) => !!(o && (o.field || o.literal))
  const incomplete = rows.filter((r) => !side(r.l) || (!UNARY_OPS.includes(r.op) && !side(r.r)))
  if (incomplete.length) out.push(`${incomplete.length} condition${incomplete.length === 1 ? ' has' : 's have'} nothing to compare — pick a field on both sides.`)
  if (isBlank(rule.message)) out.push('Say what this raises when it fails.')
  return out
}

// The parts an examination has to be able to locate by something other than a name.
//
// Only two, and both are singular: one document establishes the terms, one states when
// the presentation was made. Everything else — invoices, transport documents,
// certificates — is examined, not looked up, so it needs no role at all.
//
// This exists so lc-check can find the credit without knowing that this bank calls it
// "LC". Codes are a convention an author owns; a role is a contract.
// What a dictionary field holds. Sent to the model with the field, so it is asked
// for a date rather than left to work out that "expiry_date" wants one.
export const VALUE_TYPES = [
  { value: 'STRING', label: 'Text' },
  { value: 'DATE', label: 'Date' },
  { value: 'AMOUNT', label: 'Amount' },
  { value: 'INTEGER', label: 'Whole number' },
  { value: 'CURRENCY_CODE', label: 'Currency code' },
]

export const DOC_ROLES = [
  { value: '', label: 'None — an ordinary document type' },
  { value: 'credit', label: 'The credit — carries the terms examined against' },
  { value: 'schedule', label: 'The covering schedule — states the presentation date' },
]

// ---- Seed builders (document types, dictionary fields, reference books) -----
export function seedDocTypes() {
  return seed.docTypes.map((d) => ({ ...d }))
}

// A dictionary field is a plain business name plus the documents it can be read
// from; each binding carries one note saying what it is called there and how to
// read it. There is no reserved LC tag vocabulary — the credit is just another
// document a field is bound to.
export function seedFields() {
  return seed.fields.map((f) => ({ ...f, bindings: (f.bindings || []).map((b) => ({ ...b })) }))
}

export function seedBooks() {
  // The library as the service holds it: a book carrying its own articles. It used
  // to be assembled here out of two flat lists and a hardcoded map of section names,
  // because the fixture had no book — which meant the console could not show a title
  // nobody had written into this function.
  return seed.books.map((b) => ({ ...b, articles: (b.articles || []).map((a) => ({ ...a })) }))
}

// ---- Initial state ---------------------------------------------------------
export const initialState = {
  section: null,
  view: 'list',
  listMode: 'gallery',
  addOpen: false,
  detailTab: 'checkpoints',
  agentActive: true,
  cpActive: {},
  editingId: null, overrides: {}, editSnap: {}, ruleSnap: {}, refsOpenId: null, helpOpenId: null,
  panel: null, commentTarget: null, commentDraft: '',
  holistic: true, order: 'sev_desc', testOpen: false,
  search: '',
  extraChecks: [], newSeq: 0,
  addMenuGid: null, assignOpenId: null, fieldsOpenId: null, docsOpenId: null,
  importOpen: false, importStage: 'upload', importItems: [], importName: '', books: null, activeBookId: null, libSearch: '', tocCollapsed: {}, artEditingId: null, libAddOpen: false,
  dictTab: 'fields', dictView: 'list', dictSearch: '', dictDetail: null, dictFields: null, dictDocs: null, dictDocPickerId: null,
  rules: {}, operandOpen: null, typeFilter: 'all', newMenuOpen: false,
  // The item created by the last "new …" click. Cancel on it means "don't
  // create it" rather than "undo my typing", so it is tracked separately from
  // the edit snapshot.
  createdId: null,
  // Sort is per surface: a list is read by column, so it remembers a column.
  // Sorted by kind first, so the list opens with the exact rules together and the
  // judged ones together. Id order is arbitrary to a reader — the prefix is a concern
  // (DATE, AMT, DOCSET), not a rank — whereas kind is the first thing that changes how
  // a row is read, and a list that opens sorted by it needs no click to be useful.
  checkSort: { key: 'kind', dir: 'asc' }, dictSort: { key: 'name', dir: 'asc' },
  // Cards are browsed rather than compared, so they group instead.
  checkGroupBy: 'none',
  density: 'list', expandedIds: {}, placements: {}, activeCheckId: null,
  dragId: null, dragOverGid: null, dragGroupGid: null, activeAgentId: 'expiry', checkFrom: null,
  agentChecksView: 'list', agentArrange: false, reviewAnchorY: null, reviewAnchorX: null, confirm: null, bookQuery: '',
  inactiveIds: {}, deletedCheckIds: {}, deletedAgentIds: {}, agentEdits: {}, agentIconPickerOpen: false, extraAgents: [],
  agentGroups: seed.groups,
  comments: seed.comments,
}

// A new item goes where you will look for it next.
//
// Where order is arbitrary — the dictionary, the shelf of books, the check
// library — that is the top: you clicked "new", so the new thing should be the
// thing under your cursor, not something you have to scroll to find. Where the
// order is itself the content — an agent's groups run in sequence, a book's
// articles sit in the rulebook's own order — appending is the only honest
// answer, and the interface scrolls you to it instead of moving it.
const prepend = (list, item) => [item, ...list]

// Sorting compares like with like: numbers numerically, everything else as
// case-folded text, with a stable fallback so equal keys keep their order.
function sortBy(rows, pick, dir) {
  const sign = dir === 'desc' ? -1 : 1
  return rows
    .map((r, i) => [r, i])
    .sort(([a, ai], [b, bi]) => {
      const av = pick(a)
      const bv = pick(b)
      let c
      if (typeof av === 'number' && typeof bv === 'number') c = av - bv
      else c = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base', numeric: true })
      return c !== 0 ? c * sign : ai - bi
    })
    .map(([r]) => r)
}

// Clicking the column you are already sorting by reverses it; clicking another
// starts that one ascending.
const nextSort = (cur, key) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

// ---- Syntax highlighter for check bodies -----------------------------------
function hl(text) {
  if (!text) return [{ t: '', c: 'var(--me-ink)', bg: 'transparent' }]
  const re = /(\{[^}\n]*\})|(UCP\s?600(?:\s?art\.?\s?\d+(?:\([a-z0-9]+\))*)?|ISBP\s?821)/gim
  const out = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), c: 'var(--me-ink)', bg: 'transparent' })
    if (m[1]) out.push({ t: m[0], c: 'var(--me-blue-deep)', bg: 'var(--me-blue-20)' })
    else out.push({ t: m[0], c: 'var(--me-blue-deep)', bg: 'transparent' })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ t: text.slice(last), c: 'var(--me-ink)', bg: 'transparent' })
  return out
}

// ============================================================================
// deriveVals — takes the current state + a merging setState and returns the
// full view-model object consumed by the React section components.
// ============================================================================
export function deriveVals(state, setState) {
  const S = state
  const detailAgentId = S.activeAgentId || 'expiry'
  const allAgents = () => AGENTS.concat(S.extraAgents)
  // Per-agent edits (name / icon / accent / behaviour) overlay the seed record.
  const withEdits = (a) => (a ? { ...a, ...(S.agentEdits[a.id] || {}) } : a)
  const setAgentField = (id, field, val) => setState((s) => ({ agentEdits: { ...s.agentEdits, [id]: { ...(s.agentEdits[id] || {}), [field]: val } } }))
  const detailAgent = withEdits(allAgents().find((a) => a.id === detailAgentId) || allAgents()[0])
  const firstGroupOf = (agentId) => { const g = GROUPS.find((x) => x.agentId === agentId); return g ? g.gid : null }
  // Anchor the review drawer to its opener: vertical from the clicked icon, and
  // horizontal from the icon's card (its right edge) so the drawer sits beside
  // the card with a real gutter. Re-clicking the same opener toggles it closed.
  const reviewPatch = (target, e) => {
    const t = e && e.currentTarget
    const iconRect = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null
    const card = t && t.closest ? t.closest('[data-review-card]') : null
    const cardRect = card ? card.getBoundingClientRect() : iconRect
    return { panel: 'review', commentTarget: target, commentDraft: '', reviewAnchorY: iconRect ? iconRect.top : null, reviewAnchorX: cardRect ? cardRect.right : null }
  }
  const toggleReview = (target, e) => setState((s) => (s.panel === 'review' && s.commentTarget === target ? { panel: null } : reviewPatch(target, e)))
  // Route destructive actions through a shared confirm dialog.
  const requestConfirm = (opts) => setState({ confirm: opts })
  // Single field vocabulary: the (editable) Dictionary fields are the source of
  // truth for what checks can reference.
  const dictFieldList = S.dictFields || seedFields()
  const dictDocList = S.dictDocs || seedDocTypes()
  // Keyed by code, labelled by name — everywhere. The console worked in names, which
  // reads better and cannot be joined on: a name is a label an author may correct.
  const docNameOf = Object.fromEntries(dictDocList.map((d) => [d.key, d.name]))
  const docLabel = (key) => docNameOf[key] ?? key
  // Fields the same way. A check cites a field by key; every screen shows its name.
  const fieldNameOf = Object.fromEntries(dictFieldList.map((f) => [f.key, f.name]))
  const fieldKeyOf = Object.fromEntries(dictFieldList.map((f) => [f.name, f.key]))
  const fieldLabel = (key) => fieldNameOf[key] ?? key
  const docKeyBook = dictDocList.map((d) => d.key)
  // Every (field, document) pair the dictionary knows about — the vocabulary a
  // rule row picks its operands from.
  // The operand book, and the two indexes over it.
  //
  // A field is DEFINED once and read from several documents — that is what lets a rule
  // compare goods_description on the invoice with goods_description on the credit, and
  // it is why the dictionary is field-first. But an operand is not a field, it is a
  // field ON a document: you pick "the invoice's value", not "the value, on the
  // invoice". So the definition is field-first and the picker is document-first, over
  // exactly the same rows. Both derived, neither stored, so they cannot disagree.
  const operandBook = dictFieldList.flatMap((f) =>
    (f.bindings || []).map((b) => ({ field: f.key, fieldLabel: f.name, doc: b.doc, docLabel: docLabel(b.doc), note: b.note })))

  /** Every field readable from a document — the document-first index. */
  const fieldsByDoc = dictFieldList.reduce((acc, f) => {
    ;(f.bindings || []).forEach((b) => {
      ;(acc[b.doc] ??= []).push({ key: f.key, name: f.name, note: b.note || '', valueType: f.valueType })
    })
    return acc
  }, {})

  // A field nobody has said where to read is not pickable as an operand — there is no
  // document to name. Said out loud rather than left absent, because "the field I just
  // added is missing from the list" is indistinguishable from a bug.
  const unboundFields = dictFieldList.filter((f) => !(f.bindings || []).length).map((f) => f.name)
  // ---- one open edit at a time --------------------------------------------
  //
  // The console had three independent edit slots — a check being edited, an
  // article being written, and a just-added dictionary row that has not been
  // named — and none of them stopped you starting a fourth thing. So you could
  // click "New field" five times and end up with five unnamed rows, each having
  // silently taken the edit off the last.
  //
  // There is one slot. While it is occupied every "New …" is blocked, and the
  // block names the item holding it and takes you back to it. Resolving it means
  // finishing it (Save) or dropping it (Discard); the interface never picks for
  // you, because one of those loses typing and the other commits something
  // half-written.
  const pendingId = S.editingId || S.artEditingId || S.createdId || null
  // An add while something is pending is not a mistake to scold — it is someone
  // who lost track of where the unfinished thing is. So it takes them there.
  const guard = (fn) => (...args) => { if (pendingId) { focusItem(pendingId); return } fn(...args) }

  // Throw away whatever holds the slot, whichever kind of thing it is. A record
  // that this edit created goes entirely; one that already existed goes back to
  // its snapshot.
  const discardPending = () => setState((st) => {
    const id = st.editingId || st.artEditingId || st.createdId
    if (!id) return {}
    const clear = { editingId: null, artEditingId: null, createdId: null, operandOpen: null, refsOpenId: null, helpOpenId: null, dictDocPickerId: null }
    const es = { ...st.editSnap }; const snap = es[id]; delete es[id]
    const rs = { ...st.ruleSnap }; const rsnap = rs[id]; delete rs[id]
    const created = st.createdId === id
    const patch = { ...clear, editSnap: es, ruleSnap: rs }
    // a check
    if (st.extraChecks.some((c) => c.id === id) || CHECKS.some((c) => c.id === id)) {
      const ov = { ...st.overrides }
      if (created) delete ov[id]
      else if (snap !== undefined) ov[id] = snap
      else delete ov[id]
      const rules = { ...st.rules }
      if (created) delete rules[id]
      else if (rsnap !== undefined) rules[id] = rsnap
      return { ...patch, overrides: ov, rules, extraChecks: created ? st.extraChecks.filter((c) => c.id !== id) : st.extraChecks }
    }
    // a dictionary field or document type
    const fs = st.dictFields || seedFields()
    if (fs.some((x) => x.id === id)) return { ...patch, dictFields: created ? fs.filter((x) => x.id !== id) : fs.map((x) => (x.id === id && snap ? snap : x)), dictDetail: created ? null : st.dictDetail }
    const ds = st.dictDocs || seedDocTypes()
    if (ds.some((x) => x.id === id)) return { ...patch, dictDocs: created ? ds.filter((x) => x.id !== id) : ds.map((x) => (x.id === id && snap ? snap : x)), dictDetail: created ? null : st.dictDetail }
    // a book, or an article inside one
    const bs = st.books || seedBooks()
    if (bs.some((b) => b.id === id)) return { ...patch, books: created ? bs.filter((b) => b.id !== id) : bs, activeBookId: created ? (bs[0] ? bs[0].id : null) : st.activeBookId }
    return { ...patch, books: bs.map((b) => ({ ...b, articles: b.articles.filter((a) => !(aidOf(a) === id && a.isNew)) })) }
  })

  // Leaving an unfinished edit asks. It used to happen silently — you clicked
  // another tab and the half-written thing stayed behind, applied but orphaned.
  // Two ways out and no third: saving for someone is not on offer, because what
  // they were writing may not be saveable yet.
  const confirmLeave = (proceed) => {
    if (!pendingId) { proceed(); return }
    requestConfirm({
      title: 'Leave without saving?',
      message: `${pendingLabel} has changes that have not been saved. Leaving now throws them away.`,
      cancelLabel: 'Keep editing',
      confirmLabel: 'Discard changes',
      onConfirm: () => { discardPending(); proceed() },
    })
  }

  // Added checks lead the library. Prepending inside `extraChecks` is not enough
  // on its own — concatenating the seed first would still push a new card below
  // every seeded one, which is the position the author is not looking at.
  const allChecks = () => S.extraChecks.concat(CHECKS).filter((c) => !S.deletedCheckIds[c.id])
  const valueOf = (c, field) => {
    const o = S.overrides[c.id]
    return o && o[field] !== undefined ? o[field] : c[field]
  }
  const bookDesc = (code) => {
    const b = REF_BOOK.find((x) => x.code === code)
    return b ? b.desc : ''
  }
  const placementOf = (c) => {
    const p = S.placements[c.id]
    return p || { agentId: c.agentId || null, groupId: c.groupId || null }
  }
  const agentName = (id) => {
    const a = AGENTS.find((x) => x.id === id)
    return a ? a.name : ''
  }
  const groupName = (gid) => {
    const g = S.agentGroups.find((x) => x.gid === gid)
    return g ? g.name : ''
  }
  // What a field is read from, said in one line — the hint under a field chip.
  const fieldDocHint = (key) => {
    const f = dictFieldList.find((x) => x.key === key)
    if (!f) return 'not in dictionary'
    const ds = (f.bindings || []).map((b) => b.doc)
    if (!ds.length) return 'no source yet'
    return ds.length > 2 ? ds.length + ' documents' : ds.join(' · ')
  }

  // ---- Rule cards ----------------------------------------------------------
  const ruleOf = (id) => normaliseRule(S.rules[id] || RULE_SEEDS[id])

  // ---- Hard checks (gates) -------------------------------------------------
  //
  // A gate runs before the presentation has been read, and a failure ends the
  // examination there. Two properties have to hold and only one of them is the
  // author's to assert:
  //
  //   CAN it run first?   Derived. Every operand must read a document that exists
  //                       before anything is examined — the credit itself, or the
  //                       covering schedule the presentation arrived under. A rule
  //                       that reads the bill of lading cannot run before the bill of
  //                       lading has been read, and no amount of intent changes that.
  //                       So the toggle is disabled, with the reason, rather than
  //                       hidden: an author who wants a gate needs to know what would
  //                       make one.
  //   SHOULD it stop?     The author's call, and the toggle. It says: nothing in the
  //                       presentation could make this pass, so reading on answers a
  //                       question already answered.
  //
  // Judged rules are never eligible. An agent reading documents cannot run before the
  // documents are read, whatever its operands say.
  //
  // Which documents exist before reading is authored in the dictionary
  // (`beforeReading`), not hardcoded here, so adding a pre-presentation document type
  // makes its rules eligible without a code change.
  const beforeReadingDocs = () => new Set((S.dictDocs ?? seedDocTypes()).filter((d) => d.beforeReading).map((d) => d.key))

  function gateEligibility(c) {
    const kind = hasConditions(c) ? 'exact' : typeOf(c)
    if (kind !== 'exact') return { ok: false, why: 'Only an exact rule can run first — an agent cannot read documents before they are read.' }
    const rule = ruleOf(c.id)
    const rows = (rule.groups ?? []).flatMap((g) => g.rows ?? [])
    if (!rows.length) return { ok: false, why: 'Add a condition first — there is nothing to run.' }
    const pre = beforeReadingDocs()
    const outside = [...new Set(rows.flatMap((r) => [r.l, r.r]).map((o) => o && o.doc).filter((d) => d && !pre.has(d)))]
    if (outside.length) {
      return { ok: false, why: `Reads ${outside.join(' and ')}, which ${outside.length > 1 ? 'are' : 'is'} not available until the presentation has been read.` }
    }
    return { ok: true, why: 'Every operand comes from the credit or the covering schedule, so this can run before anything is examined.' }
  }

  // A card with authored conditions is an exact rule, whatever its `checkType` says.
  //
  // This is a guard rather than a preference. Retiering CERT-28 to AGENT_TOOL in a
  // migration left its five authored rows orphaned: the card rendered the prose
  // editor, its conditions were never shown, and nothing anywhere complained. The
  // data is fixed, and this makes the same mistake impossible to make silently —
  // conditions that exist are conditions that get edited.
  const hasConditions = (c) => !!(c && (S.rules[c.id] || RULE_SEEDS[c.id]))
  const setRule = (id, fn) => setState((s) => ({ rules: { ...s.rules, [id]: fn(normaliseRule(s.rules[id] || RULE_SEEDS[id])) } }))
  const mapGroups = (rule, gid, fn) => ({ ...rule, groups: rule.groups.map((g) => (g.id === gid ? fn(g) : g)) })
  // Which fields a rule reads — so the dictionary can tell how often a field is
  // used without the check having to list it twice.
  const ruleFieldsOf = (id) =>
    ruleOf(id).groups.flatMap((g) => g.rows.flatMap((r) => [r.l && r.l.field, r.r && r.r.field])).filter(Boolean)

  const assignCheck = (id, agentId) =>
    setState((s) => ({ placements: { ...s.placements, [id]: { agentId, groupId: agentId ? firstGroupOf(agentId) : null } }, assignOpenId: null }))
  const assignToGroup = (id, gid, agentId) =>
    setState((s) => ({ placements: { ...s.placements, [id]: { agentId, groupId: gid } }, addMenuGid: null }))
  const renameGroup = (gid, name) => setState((s) => ({ agentGroups: s.agentGroups.map((x) => (x.gid === gid ? { ...x, name } : x)) }))
  const addGroupFor = (agentId) => setState((s) => { const n = s.agentGroups.filter((x) => x.agentId === agentId).length + 1; return { agentGroups: [...s.agentGroups, { agentId, gid: uid('G'), name: 'Group ' + n }] } })
  // Reorder groups within an agent (positional — the sequence number follows order).
  const moveGroup = (gid, delta) => setState((s) => {
    const groups = [...s.agentGroups]
    const idx = groups.findIndex((g) => g.gid === gid)
    if (idx < 0) return {}
    const same = groups.map((g, i) => (g.agentId === groups[idx].agentId ? i : -1)).filter((i) => i >= 0)
    const pos = same.indexOf(idx)
    const target = pos + delta
    if (target < 0 || target >= same.length) return {}
    const j = same[target]
    ;[groups[idx], groups[j]] = [groups[j], groups[idx]]
    return { agentGroups: groups }
  })
  // Drag-drop reorder: move the dragged group to the drop target's position.
  // Sequence numbers are positional, so they auto-adjust after the reorder.
  const reorderGroups = (fromGid, toGid) => setState((s) => {
    if (fromGid === toGid) return { dragGroupGid: null, dragOverGid: null }
    const groups = [...s.agentGroups]
    const from = groups.findIndex((g) => g.gid === fromGid)
    if (from < 0) return { dragGroupGid: null, dragOverGid: null }
    const [moved] = groups.splice(from, 1)
    const to = groups.findIndex((g) => g.gid === toGid)
    groups.splice(to < 0 ? groups.length : to, 0, moved)
    return { agentGroups: groups, dragGroupGid: null, dragOverGid: null }
  })
  const deleteGroup = (gid) => setState((s) => {
    const placements = { ...s.placements }
    allChecks().forEach((c) => { const cur = s.placements[c.id] || { agentId: c.agentId || null, groupId: c.groupId || null }; if (cur.groupId === gid) placements[c.id] = { agentId: null, groupId: null } })
    return { agentGroups: s.agentGroups.filter((g) => g.gid !== gid), placements }
  })
  // Check lifecycle: inactivate (excluded from runs) and delete (with confirm).
  // Retiring stops a check running. It was held in `inactiveIds` and written
  // nowhere, so it survived exactly as long as the tab did — the same complaint as
  // the Draft chip, one screen over. The service filters RETIRED out of the
  // catalogue, so this is what makes the button mean anything.
  const toggleInactive = (id) => setState((s) => {
    const c = allChecks().find((x) => x.id === id)
    // Read the same way the card does — this session's answer if there is one, the
    // service's otherwise. Reading only `inactiveIds` made the first press on a
    // retired check retire it again.
    const was = s.inactiveIds[id] ?? (c && c.status === 'RETIRED')
    const now = !was
    if (c) persistCheck({ ...c, ...(s.overrides[id] || {}), inactive: now }, ruleOf(id))
    return { inactiveIds: { ...s.inactiveIds, [id]: now } }
  })
  const deleteAgent = (id) => (gov.deleteAgent(id).catch(() => {}), setState((s) => {
    const placements = { ...s.placements }
    allChecks().forEach((c) => { const cur = s.placements[c.id] || { agentId: c.agentId || null, groupId: c.groupId || null }; if (cur.agentId === id) placements[c.id] = { agentId: null, groupId: null } })
    return { deletedAgentIds: { ...s.deletedAgentIds, [id]: true }, agentGroups: s.agentGroups.filter((g) => g.agentId !== id), placements, activeAgentId: s.activeAgentId === id ? null : s.activeAgentId, view: s.activeAgentId === id ? 'list' : s.view }
  }))
  const deleteCheck = (id) => setState((s) => {
    const placements = { ...s.placements }; delete placements[id]
    const overrides = { ...s.overrides }; delete overrides[id]
    return { extraChecks: s.extraChecks.filter((c) => c.id !== id), deletedCheckIds: { ...s.deletedCheckIds, [id]: true }, placements, overrides, activeCheckId: s.activeCheckId === id ? null : s.activeCheckId, panel: s.commentTarget === id ? null : s.panel }
  })
  const acceptSuggestion = (id) => {
    const c = allChecks().find((x) => x.id === id)
    if (!c) return
    const body = valueOf(c, 'body') || ''
    const base = { title: valueOf(c, 'title'), severity: valueOf(c, 'severity'), refs: [...(valueOf(c, 'refs') || [])], body }
    setState((s) => ({ overrides: { ...s.overrides, [id]: { ...(s.overrides[id] || base), body: body + '\n- ' + (c.suggestion || '') } } }))
  }
  const refine = (kind) => {
    const t = S.commentTarget
    if (!t) return
    const c = allChecks().find((x) => x.id === t)
    let text
    if (kind === 'missing') text = c ? c.suggestion || 'This check looks complete — every scenario has an outcome.' : 'Make sure each item has a clear outcome and severity.'
    else if (kind === 'tighten') text = 'Lead each line with the trigger, then the action; keep one idea per line and cut hedging words.'
    else text = 'Checked against recent cases — no contradictions; 2 recent cases reinforce this check.'
    const entry = { assistant: true, when: 'just now', text, canAdd: kind === 'missing' && !!c }
    setState((s) => ({ comments: { ...s.comments, [t]: [...(s.comments[t] || []), entry] } }))
  }

  // A new card lands in the GEN concern (general examiner judgement); whoever
  // wrote it moves it to its proper id when it settles. The kind is chosen up
  // front because it decides what the card is made of — a rule opens on an empty
  // condition block, a judged one on an empty dash line.
  //
  // It is not a draft. It exists in the console until it is saved and it runs
  // after that; there is no third state, and there was no way out of the one the
  // card used to be stuck in — saving it left the Draft chip exactly where it was.
  const newCheck = (kind) =>
    setState((s) => {
      const id = 'GEN-' + String(s.newSeq + 90).padStart(2, '0')
      const isExact = kind === 'exact'
      const nc = {
        id, checkType: isExact ? 'PROGRAMMATIC' : 'AGENT', domain: 'Uncategorised', cases: 0,
        agentId: null, groupId: null,
        title: isExact ? 'New exact rule' : 'New judged rule',
        severity: 'MAJOR', refs: [],
        suggestion: isExact
          ? 'Fill in both sides of the first condition so the rule has something to compare.'
          : 'Add a requirement or two so the assistant has something to read against.',
        body: isExact ? '' : 'Say what must be true, one requirement per dash line.\n\n- ',
        timeline: [{ color: 'var(--me-blue)', label: 'Created', date: 'just now', detail: 'New ' + CARD_TYPES[isExact ? 'exact' : 'judged'].label.toLowerCase() + ' rule card.' }],
      }
      // Adding respects the view you are in.
      //
      // In cards, the editor is on the card, so a new one is prepended and you are
      // already looking at it. In list, a row has no editor — it used to switch the
      // whole section to cards, which is the view changing under you as a side effect
      // of adding one thing. So list opens the new item on its own page, which is
      // where a row goes when you click it and where there is room to fill it in.
      const toList = s.density === 'list'
      const patch = {
        extraChecks: prepend(s.extraChecks, nc), newSeq: s.newSeq + 1,
        editingId: id, createdId: id, section: 'checks', newMenuOpen: false, typeFilter: 'all',
        ...(toList
          ? { activeCheckId: id, checkFrom: { section: s.section, view: s.view, activeAgentId: s.activeAgentId } }
          : {}),
      }
      if (isExact) patch.rules = { ...s.rules, [id]: ruleBlank() }
      return patch
    })

  function buildCheck(c, ctx) {
    const title = valueOf(c, 'title')
    const severity = (valueOf(c, 'severity') || 'MAJOR').toUpperCase()
    const refs = valueOf(c, 'refs') || []
    const body = valueOf(c, 'body') || ''
    const dflt = CHECK_DEFAULTS[c.id] || {}
    const fields = valueOf(c, 'fields') || dflt.fields || []
    const docs = valueOf(c, 'docs') || dflt.docs || []
    const editing = S.editingId === c.id
    const active = S.cpActive[c.id] === undefined ? true : S.cpActive[c.id]
    // What the service says, unless this session has changed it. `inactiveIds` used to
    // be the only source, so retiring a check survived exactly as long as the tab did.
    const inactive = S.inactiveIds[c.id] ?? (c.status === 'RETIRED')
    // Which kind of card this is decides what the middle of it holds, and it is
    // read before the snapshot below so Cancel can put the rule back too.
    // `hasConditions` wins over the declared tier — see the guard above.
    const kind = hasConditions(c) ? 'exact' : typeOf(c)
    const isExact = kind === 'exact'
    const rule = isExact ? ruleOf(c.id) : null
    const gate = gateEligibility(c)
    const isGateOn = !!valueOf(c, 'gate') && gate.ok
    // A check that has examined a case is referenced by the findings it produced
    // and by any refusal advice quoting them. Deleting it orphans that record, so
    // Only a check that has never run can be deleted; one that has is retired, so
    // the findings quoting its id stay readable.
    const timesUsed = c.cases || 0
    const deletable = timesUsed === 0
    const cc = S.comments[c.id] || []
    const inAgent = ctx === 'agent'
    // What Cancel puts back. The rule travels with it — without that, undoing an
    // edit restored the title and left the conditions rewritten.
    const snapNow = { title, severity, refs: [...refs], body, fields: [...fields], docs: [...docs] }
    const snapRule = isExact ? JSON.parse(JSON.stringify(rule)) : null
    const takeSnap = (s) => ({
      editSnap: s.editSnap[c.id] !== undefined ? s.editSnap : { ...s.editSnap, [c.id]: snapNow },
      ruleSnap: !isExact || s.ruleSnap[c.id] !== undefined ? s.ruleSnap : { ...s.ruleSnap, [c.id]: snapRule },
    })
    const startEdit = () => {
      if (S.editingId === c.id) return
      if (S.editingId || S.artEditingId || S.createdId) {
        // Another card is open. Ask, and on yes land in the one just clicked.
        confirmLeave(() => setState((s) => ({ editingId: c.id, ...takeSnap(s) })))
        return
      }
      setState((s) => ({ editingId: c.id, ...takeSnap(s) }))
    }
    const write = (field, val) =>
      setState((s) => {
        const base = s.overrides[c.id] || snapNow
        return {
          editingId: c.id,
          ...takeSnap(s),
          overrides: { ...s.overrides, [c.id]: { ...base, [field]: val } },
        }
      })
    const compactMode = false
    const expanded = !!S.expandedIds[c.id]
    const showBody = editing || !compactMode || expanded
    // Field names the author has already braced in the body text.
    const detectNames = () => {
      // The body braces a field by NAME, because it is prose a model reads and reads
      // better in English. What lands on the card is the key.
      const known = dictFieldList.map((f) => f.name)
      const out = []
      const fre = /\{\s*([^}\n]+?)\s*\}/g
      let fm
      while ((fm = fre.exec(body)) !== null) {
        const key = fieldKeyOf[fm[1]]
        if (known.includes(fm[1]) && key && !out.includes(key)) out.push(key)
      }
      return out
    }
    const place = placementOf(c)
    const inLabel = place.agentId ? agentName(place.agentId) + (place.groupId ? ' · ' + groupName(place.groupId) : '') : 'Not in an agent'
    const preview = (body.split('\n').find((l) => l.trim()) || '').replace(/[{}]/g, '')

    // ---- card type ---------------------------------------------------------
    const meta = CARD_TYPES[kind]
    // A rule states its operands in its own rows, so the chip rows and the
    // plain-language body belong to judged rules only.
    const showFieldRows = !isExact
    const patchRule = (fn) => { setRule(c.id, fn); startEdit() }
    const issues = editing ? checkIssues({ title, body }, rule, isExact) : []

    const operandVM = (gid, r, side) => {
      const o = (side === 'l' ? r.l : r.r) || {}
      const openKey = `${c.id}|${gid}|${r.id}|${side}`
      const set = (val) => patchRule((ru) => mapGroups(ru, gid, (g) => ({ ...g, rows: g.rows.map((x) => (x.id === r.id ? { ...x, [side]: val } : x)) })))
      const unset = !o.field && !o.literal
      return {
        isLiteral: !!o.literal || (side === 'r' && EXPR_OPS.includes(r.op)),
        isField: !o.literal && !(side === 'r' && EXPR_OPS.includes(r.op)),
        field: o.field ? fieldLabel(o.field) : 'Pick a field', doc: o.field ? docLabel(o.doc) : '',
        literal: o.literal || '',
        literalPlaceholder: EXPR_OPS.includes(r.op) ? 'An expression, e.g. matches /^[A-Z]{3}$/' : 'A fixed value…',
        onChangeLiteral: (e) => set({ literal: e.target.value }),
        onUseLiteral: () => { set({ literal: '' }); setState({ operandOpen: null }) },
        border: unset ? 'var(--me-grey-20)' : 'var(--me-grey-15)', borderStyle: unset ? 'dashed' : 'solid',
        bg: unset ? 'transparent' : 'var(--me-grey-08)', color: unset ? 'var(--me-grey-70)' : 'var(--me-ink)',
        open: S.operandOpen === openKey,
        onToggle: (e) => { if (e && e.stopPropagation) e.stopPropagation(); startEdit(); setState((s) => ({ operandOpen: s.operandOpen === openKey ? null : openKey })) },
        // Grouped by document, dictionary order within each. Picking reads
        // "Commercial invoice → Invoice value", which is the order the operand is
        // addressed in and the order an examiner says it out loud.
        book: Object.entries(
          operandBook.reduce((acc, op) => { (acc[op.docLabel] ??= []).push(op); return acc }, {}),
        )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([docName, ops]) => ({
            docName,
            fields: ops.map((op) => ({
              field: op.fieldLabel,
              note: op.note,
              selected: op.field === o.field && op.doc === o.doc,
              onPick: () => { set({ field: op.field, doc: op.doc }); setState({ operandOpen: null }) },
            })),
          })),
        unbound: unboundFields,
      }
    }

    const ruleGroups = !rule ? [] : rule.groups.map((g, gi) => ({
      id: g.id,
      showConnector: gi > 0, connector: g.connector || 'AND',
      onToggleConnector: () => patchRule((ru) => mapGroups(ru, g.id, (x) => ({ ...x, connector: (x.connector || 'AND') === 'AND' ? 'OR' : 'AND' }))),
      railColor: g.logic === 'any' ? 'var(--me-blue-20)' : 'var(--me-grey-15)',
      showHead: rule.groups.length > 1 || g.logic === 'any',
      logicLabel: g.logic === 'any' ? 'Any of these' : 'All of these',
      onToggleLogic: () => patchRule((ru) => mapGroups(ru, g.id, (x) => ({ ...x, logic: x.logic === 'all' ? 'any' : 'all' }))),
      canRemove: rule.groups.length > 1,
      onRemove: () => patchRule((ru) => tidyRule({ ...ru, groups: ru.groups.filter((x) => x.id !== g.id) })),
      onAddRow: () => patchRule((ru) => mapGroups(ru, g.id, (x) => ({ ...x, rows: [...x.rows, blankRow()] }))),
      rows: g.rows.map((r, ri) => ({
        id: r.id,
        joiner: ri === 0 ? '' : g.logic === 'any' ? 'or' : 'and',
        op: r.op, opLabel: opLabel(r.op),
        onChangeOp: (e) => { const op = e.target.value; patchRule((ru) => mapGroups(ru, g.id, (x) => ({ ...x, rows: x.rows.map((y) => (y.id === r.id ? { ...y, op } : y)) }))) },
        opGroups: OP_GROUPS,
        showRight: !UNARY_OPS.includes(r.op),
        showTol: !UNARY_OPS.includes(r.op),
        tol: r.tol || '',
        onChangeTol: (e) => { const tol = e.target.value; patchRule((ru) => mapGroups(ru, g.id, (x) => ({ ...x, rows: x.rows.map((y) => (y.id === r.id ? { ...y, tol } : y)) }))) },
        onRemove: () => patchRule((ru) => tidyRule(mapGroups(ru, g.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) })))),
        // Flagged only once the author has been told what is missing, so a
        // half-typed condition isn't scolded while it is being typed.
        incomplete: editing && issues.length > 0 && (!(r.l && (r.l.field || r.l.literal)) || (!UNARY_OPS.includes(r.op) && !(r.r && (r.r.field || r.r.literal)))),
        left: operandVM(g.id, r, 'l'),
        right: operandVM(g.id, r, 'r'),
      })),
    }))

    return {
      id: c.id, title, body, bodySegments: hl(body), dictFields: dictFieldList.map((f) => ({ name: f.name, docs: fieldDocHint(f.key) })), severity,
      kind, isExact, isJudged: !isExact,
      // Hard check. `gateOn` is the stored intent narrowed by what is possible, so a
      // rule that stops being eligible (an operand moved to a presented document)
      // stops being a gate rather than silently claiming to run first.
      gateOn: isGateOn,
      gateEligible: gate.ok,
      gateWhy: gate.why,
      onToggleGate: gate.ok
        ? () => {
            // Sent on its own rather than folded into the next save: a gate is the one
            // property whose truth the service can refuse, and the author should learn
            // that when they press it.
            gov.setGate(c.id, !isGateOn).catch(() => {})
            setState((st) => ({ overrides: { ...st.overrides, [c.id]: { ...st.overrides[c.id], gate: !isGateOn } }, editingId: st.editingId ?? c.id }))
          }
        : null,
      typeLabel: meta.label, typeIcon: meta.icon, typeColor: meta.color, typeBg: meta.bg, typeHint: meta.hint,
      showFieldRows,
      ruleScope: rule ? rule.scope || '' : '', onChangeScope: (e) => { const scope = e.target.value; patchRule((ru) => ({ ...ru, scope })) },
      ruleMessage: rule ? rule.message || '' : '', onChangeMessage: (e) => { const message = e.target.value; patchRule((ru) => ({ ...ru, message })) },
      ruleGroups, opGroups: OP_GROUPS,
      onAddGroup: () => patchRule((ru) => ({ ...ru, groups: [...ru.groups, { id: uid('g'), logic: 'all', connector: 'AND', rows: [blankRow()] }] })),
      // The structure controls only appear once you are editing, and until now
      // the only way in was to click into a field — so a finished rule offered
      // no way to add a condition to it. This is that way in.
      showEditEntry: isExact && !editing,
      onStartEdit: () => startEdit(),
      sevColor: (SEV_META[severity] || SEV_META.MAJOR).color,
      onChangeSev: (e) => write('severity', e.target.value),
      fieldChips: fields.map((n) => ({ name: fieldLabel(n), docHint: fieldDocHint(n), onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('fields', fields.filter((x) => x !== n)) } })),
      hasFields: fields.length > 0,
      fieldBook: dictFieldList.filter((f) => !fields.includes(f.key)).map((f) => ({ name: f.name, docs: fieldDocHint(f.key), onAdd: () => { write('fields', [...fields, f.key]); setState({ fieldsOpenId: null }) } })),
      fieldsOpen: S.fieldsOpenId === c.id,
      onToggleFields: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ fieldsOpenId: s.fieldsOpenId === c.id ? null : c.id })) },
      onDetectFields: () => { const merged = fields.slice(); detectNames().forEach((n) => { if (!merged.includes(n)) merged.push(n) }); write('fields', merged); setState({ fieldsOpenId: null }) },
      docChips: docs.map((d) => ({ name: docLabel(d), onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('docs', docs.filter((x) => x !== d)) } })),
      hasDocs: docs.length > 0,
      docBook: docKeyBook.filter((d) => !docs.includes(d)).map((d) => ({ name: docLabel(d), onAdd: () => { write('docs', [...docs, d]); setState({ docsOpenId: null }) } })),
      docsOpen: S.docsOpenId === c.id,
      onToggleDocs: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ docsOpenId: s.docsOpenId === c.id ? null : c.id })) },
      refChips: refs.map((code) => ({ code, desc: bookDesc(code), onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('refs', refs.filter((x) => x !== code)) } })),
      refBook: REF_BOOK.filter((b) => !refs.includes(b.code)).map((b) => ({ code: b.code, desc: b.desc, onAdd: () => { write('refs', [...refs, b.code]); setState({ refsOpenId: null }) } })),
      refsOpen: S.refsOpenId === c.id,
      onToggleRefs: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ refsOpenId: s.refsOpenId === c.id ? null : c.id })) },
      helpOpen: S.helpOpenId === c.id,
      onToggleHelp: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ helpOpenId: s.helpOpenId === c.id ? null : c.id })) },
      casesLabel: c.cases + (c.cases === 1 ? ' linked case' : ' linked cases'),
      commentCount: cc.length, hasComments: cc.length > 0,
      editing, showBody: showBody && !isExact, expanded, showPreview: compactMode && !expanded && !editing, preview: isExact ? rule.message || rule.scope || '' : preview,
      showExpand: compactMode, expandIcon: expanded ? 'chevron-up' : 'chevron-down',
      onToggleExpand: () => setState((s) => ({ expandedIds: { ...s.expandedIds, [c.id]: !s.expandedIds[c.id] } })),
      cardBorder: editing ? 'var(--me-blue-20)' : 'var(--me-grey-15)',
      editorBorder: editing ? 'var(--me-grey-20)' : 'transparent',
      active, inactive, rowOpacity: inAgent && !active ? 0.5 : inactive ? 0.55 : 1,
      onToggleInactive: () => toggleInactive(c.id),
      retired: inactive,
      deletable,
      timesUsed,
      deleteTip: deletable
        ? 'Delete this check — it has never run'
        : `${c.id} has run on ${timesUsed} case${timesUsed === 1 ? '' : 's'} — retire it instead so the findings that cite it stay readable`,
      onDelete: () =>
        deletable
          ? requestConfirm({
              title: 'Delete check?',
              message: `${c.id} “${title}” has never run. It will be permanently removed.`,
              confirmLabel: 'Delete check',
              onConfirm: () => { deleteCheck(c.id); gov.deleteCheck(c.id).catch(() => {}) },
            })
          : requestConfirm({
              title: 'This check cannot be deleted',
              message: `${c.id} has examined ${timesUsed} case${timesUsed === 1 ? '' : 's'}. Findings and refusal advices quote that reference, and deleting it would leave them pointing at nothing. Retire it instead — it stops running, and the record stays readable.`,
              blocked: true,
              acknowledgeLabel: 'Retire instead',
              onConfirm: () => toggleInactive(c.id),
            }),
      trackBg: active ? 'var(--me-blue)' : 'var(--me-grey-20)', knobLeft: active ? '16px' : '2px',
      showDrag: inAgent && S.agentArrange, draggable: inAgent && S.agentArrange && !editing,
      showToggle: inAgent, showComment: true,
      // Where a check sits, and how to move it, are both agent-linked (features.js).
      // `place` is still read and still written — only shown while the link is on.
      showInLine: AGENT_LINK, inLabel,
      showAssign: AGENT_LINK && !inAgent, assignLabel: place.agentId ? agentName(place.agentId) : 'Add to agent',
      assignBorder: place.agentId ? 'var(--me-blue)' : 'var(--me-grey-20)', assignBg: place.agentId ? 'var(--me-blue-20)' : '#fff', assignColor: place.agentId ? 'var(--me-blue-deep)' : 'var(--me-grey-70)', assignIcon: place.agentId ? 'bot' : 'plus',
      assignOpen: S.assignOpenId === c.id,
      onToggleAssign: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ assignOpenId: s.assignOpenId === c.id ? null : c.id })) },
      assignOptions: AGENTS.map((a) => ({ label: a.name, icon: 'bot', selected: place.agentId === a.id, onPick: () => assignCheck(c.id, a.id) })).concat(
        place.agentId ? [{ label: 'Remove from agent', icon: 'x', tone: 'danger', onPick: () => assignCheck(c.id, null) }] : []
      ),
      onDragStart: (e) => { setState({ dragId: c.id }); if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id) } catch (x) {} } },
      onFocus: () => startEdit(),
      onChangeTitle: (e) => write('title', e.target.value),
      onChangeBody: (val) => write('body', val), // RuleEditor (CodeMirror) passes the value string directly
      // Save is held back while the card is still missing something it cannot
      // run without; `issues` says what, right beside the button.
      issues,
      canSave: !issues.length,
      // Which field each complaint belongs to. The list beside the button says what
      // is wrong; these put the mark on the thing that is wrong, because a reader
      // should not have to work out which box "Give it a title" refers to.
      titleMissing: editing && isBlank(title),
      bodyMissing: editing && !isExact && isBlank(body),
      messageMissing: editing && isExact && isBlank(rule.message),
      onSave: () => {
        if (issues.length) return
        // Write through to the service before the edit slot closes. Under mock this
        // resolves without doing anything, which is honest: the store already holds
        // the edit, and persistence is the only thing missing.
        //
        // The overrides have to be in it. Every edit on this card except the title and
        // the body is held there — the fields it reads, the documents it applies to,
        // the articles it cites, its severity — and this used to send the check as it
        // arrived plus those two. So picking a field showed the chip, saved nothing,
        // and the chip was gone on reload: the one thing an author would swear they
        // had just done.
        persistCheck(
          { ...c, ...(S.overrides[c.id] || {}), title: (title || '').trim(), body: (body || '').trim() },
          rule,
        )
        setState((s) => {
          const es = { ...s.editSnap }; delete es[c.id]
          const rs = { ...s.ruleSnap }; delete rs[c.id]
          const base = s.overrides[c.id] || snapNow
          return { editingId: null, createdId: null, refsOpenId: null, helpOpenId: null, operandOpen: null, editSnap: es, ruleSnap: rs, overrides: { ...s.overrides, [c.id]: { ...base, title: (title || '').trim(), body: (body || '').trim() } } }
        })
      },
      // Cancel on an item created by this edit means "don't create it". Nothing
      // has been committed and no finding cites it, so it goes without a
      // confirm — and the button says Discard, not Cancel.
      isNew: S.createdId === c.id,
      cancelLabel: S.createdId === c.id ? 'Discard' : 'Cancel',
      onCancel: () => setState((s) => {
        if (s.createdId === c.id) {
          const ov = { ...s.overrides }; delete ov[c.id]
          const es = { ...s.editSnap }; delete es[c.id]
          const rs = { ...s.ruleSnap }; delete rs[c.id]
          const rules = { ...s.rules }; delete rules[c.id]
          return { editingId: null, createdId: null, refsOpenId: null, helpOpenId: null, operandOpen: null, overrides: ov, editSnap: es, ruleSnap: rs, rules, extraChecks: s.extraChecks.filter((x) => x.id !== c.id) }
        }
        const snap = s.editSnap[c.id]
        const ov = { ...s.overrides }
        if (snap === undefined) delete ov[c.id]
        else ov[c.id] = snap
        const es = { ...s.editSnap }; delete es[c.id]
        const rules = { ...s.rules }
        const rs = { ...s.ruleSnap }
        if (isExact && rs[c.id] !== undefined) rules[c.id] = rs[c.id]
        delete rs[c.id]
        return { editingId: null, createdId: null, refsOpenId: null, helpOpenId: null, operandOpen: null, overrides: ov, editSnap: es, rules, ruleSnap: rs }
      }),
      onOpen: () => confirmLeave(() => setState((s) => ({ activeCheckId: c.id, editingId: null, panel: null, checkFrom: { section: s.section, view: s.view, activeAgentId: s.activeAgentId } }))),
      onComment: (e) => { if (e && e.stopPropagation) e.stopPropagation(); toggleReview(c.id, e) },
      onToggleActive: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ cpActive: { ...s.cpActive, [c.id]: !(s.cpActive[c.id] === undefined ? true : s.cpActive[c.id]) } })) },
    }
  }

  const moveCheck = (id, toGid) => {
    if (!id) { setState({ dragOverGid: null }); return }
    setState((s) => ({ placements: { ...s.placements, [id]: { agentId: detailAgentId, groupId: toGid } }, dragId: null, dragOverGid: null }))
  }

  // -------- derivation (renderVals) ----------
  const section = S.section || START_SECTION
  const view = S.view
  const tab = S.detailTab
  const byId = {}
  allChecks().forEach((c) => { byId[c.id] = c })

  // Check detail — a single check card with a back link. Reachable from the
  // Checks list or from inside an agent; back returns to wherever you came from.
  let checkDetail = null
  if (S.activeCheckId && byId[S.activeCheckId]) {
    const from = S.checkFrom || { section: 'checks' }
    checkDetail = {
      id: byId[S.activeCheckId].id,
      backLabel: from.section === 'agents' ? 'Back to agent' : 'Back to checks',
      check: buildCheck(byId[S.activeCheckId], 'library'),
      onBack: () => confirmLeave(() => setState((s) => ({ activeCheckId: null, editingId: null, panel: null, section: from.section, view: from.view || 'list', activeAgentId: from.activeAgentId || s.activeAgentId }))),
    }
  }

  const detailGroupCount = S.agentGroups.filter((g) => g.agentId === detailAgentId).length
  const groups = S.agentGroups.filter((g) => g.agentId === detailAgentId).map((g, gi) => {
    const addable = allChecks()
      .filter((c) => { const p = placementOf(c); return !(p.agentId === detailAgentId && p.groupId === g.gid) })
      .map((c) => { const p = placementOf(c); return { title: valueOf(c, 'title'), kindIcon: CARD_TYPES[typeOf(c)].icon, domain: p.agentId === detailAgentId ? 'move here' : p.agentId ? 'from ' + agentName(p.agentId) : 'unassigned', sevColor: (SEV_META[(valueOf(c, 'severity') || 'MAJOR').toUpperCase()] || SEV_META.MAJOR).color, onAdd: () => assignToGroup(c.id, g.gid, detailAgentId) } })
    const gc = S.comments[g.gid] || []
    const cks = allChecks().filter((c) => { const p = placementOf(c); return p.agentId === detailAgentId && p.groupId === g.gid }).map((c) => buildCheck(c, 'agent'))
    return {
      ...g, seq: gi + 1, onRename: (e) => renameGroup(g.gid, e.target.value),
      canMoveUp: gi > 0, canMoveDown: gi < detailGroupCount - 1,
      onMoveUp: () => moveGroup(g.gid, -1), onMoveDown: () => moveGroup(g.gid, 1),
      onDelete: () => requestConfirm({ title: 'Delete group?', message: `“${g.name}” will be removed. Its ${cks.length} check${cks.length === 1 ? '' : 's'} return to the unassigned pool — they aren't deleted.`, confirmLabel: 'Delete group', onConfirm: () => deleteGroup(g.gid) }),
      count: cks.length + (cks.length === 1 ? ' check' : ' checks'),
      checks: cks, empty: cks.length === 0,
      commentCount: gc.length, hasComments: gc.length > 0,
      onComment: (e) => toggleReview(g.gid, e),
      onGroupDragStart: (e) => { setState({ dragGroupGid: g.gid }); if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', g.gid) } catch (x) {} } },
      onGroupDragEnd: () => setState({ dragGroupGid: null, dragOverGid: null }),
      onDragOver: (e) => { e.preventDefault() },
      onDragEnter: (e) => { e.preventDefault(); if (S.dragOverGid !== g.gid) setState({ dragOverGid: g.gid }) },
      onDrop: (e) => { e.preventDefault(); if (S.dragGroupGid) reorderGroups(S.dragGroupGid, g.gid); else moveCheck(S.dragId, g.gid) },
      dropBorder: S.dragOverGid === g.gid ? 'var(--me-blue)' : 'transparent',
      dropBg: S.dragOverGid === g.gid ? 'var(--me-blue-20)' : 'var(--me-grey-08)',
      onAdd: () => setState((s) => ({ addMenuGid: s.addMenuGid === g.gid ? null : g.gid })),
      addOpen: S.addMenuGid === g.gid, addable, noAddable: addable.length === 0,
    }
  })

  const q = (S.search || '').toLowerCase()
  // A rule card has no prose body, so its searchable text is its own rows: the
  // fields it compares, the documents they are read from and what it raises.
  const searchText = (c) => {
    const base = valueOf(c, 'title') + ' ' + valueOf(c, 'body') + ' ' + (valueOf(c, 'refs') || []).join(' ')
    if (typeOf(c) !== 'exact') return base
    const r = ruleOf(c.id)
    const rows = r.groups.flatMap((g) => g.rows).flatMap((x) => [x.l && x.l.field, x.l && x.l.doc, x.r && x.r.field, x.r && x.r.doc, x.r && x.r.literal])
    return base + ' ' + r.scope + ' ' + r.message + ' ' + rows.filter(Boolean).join(' ')
  }
  const typeFilter = S.typeFilter || 'all'
  const matchedChecks = allChecks().filter((c) => !q || searchText(c).toLowerCase().includes(q))
  const shown = matchedChecks.filter((c) => typeFilter === 'all' || typeOf(c) === typeFilter)

  // A list is read column by column, so it sorts. A newly added card stays put
  // at the top until you sort deliberately — otherwise naming it moves it.
  const SEV_RANK = { CRITICAL: 0, MAJOR: 1, MINOR: 2 }
  const checkSort = S.createdId ? { key: 'none', dir: 'asc' } : S.checkSort
  const CHECK_SORT = {
    id: (c) => c.id,
    kind: (c) => c.typeLabel,
    title: (c) => c.title,
    severity: (c) => SEV_RANK[c.severity] ?? 9,
    ...(AGENT_LINK ? { agent: (c) => c.inLabel } : null),
  }
  const built = shown.map((c) => buildCheck(c, 'library'))
  const libChecks = CHECK_SORT[checkSort.key] ? sortBy(built, CHECK_SORT[checkSort.key], checkSort.dir) : built
  const checkSortCol = (key) => ({ active: checkSort.key === key, dir: checkSort.dir, onSort: () => setState((x) => ({ checkSort: nextSort(x.checkSort, key), createdId: null })) })

  // A wall of tall cards can't be compared the way rows can — you never see two
  // at once. What helps there is grouping: it turns one long scroll into a few
  // named runs, each with a count, so "where am I" has an answer. Sorting still
  // applies, inside each group.
  const GROUPERS = {
    none: null,
    kind: { label: 'Kind', of: (c) => c.typeLabel },
    severity: { label: 'Severity', of: (c) => ({ CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor' }[c.severity] || c.severity), order: ['Critical', 'Major', 'Minor'] },
    ...(AGENT_LINK ? { agent: { label: 'Agent', of: (c) => c.inLabel.split(' · ')[0] } } : null),
  }
  const groupBy = S.checkGroupBy || 'none'
  const grouper = GROUPERS[groupBy]
  const checkGroups = !grouper
    ? [{ key: 'all', name: '', count: 0, checks: libChecks, ungrouped: true }]
    : (() => {
        const buckets = new Map()
        libChecks.forEach((c) => {
          const k = grouper.of(c) || 'Unassigned'
          if (!buckets.has(k)) buckets.set(k, [])
          buckets.get(k).push(c)
        })
        let keys = [...buckets.keys()]
        if (grouper.order) keys.sort((a, b) => (grouper.order.indexOf(a) + 1 || 99) - (grouper.order.indexOf(b) + 1 || 99))
        // Named groups alphabetically; whatever fell through last, so the run
        // that says nothing about a check does not head the page.
        else keys.sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)))
        return keys.map((k) => ({ key: k, name: k, count: buckets.get(k).length, checks: buckets.get(k) }))
      })()
  const typeFilters = [
    { id: 'all', label: 'All' },
    { id: 'exact', label: 'Exact' },
    { id: 'judged', label: 'Judged' },
  ].map((t) => ({
    ...t,
    count: t.id === 'all' ? matchedChecks.length : matchedChecks.filter((c) => typeOf(c) === t.id).length,
    on: typeFilter === t.id,
    onPick: () => setState({ typeFilter: t.id }),
  }))

  let panelCtx = null
  if (S.panel === 'review' && S.commentTarget) {
    const t = S.commentTarget
    const cmts = (S.comments[t] || []).map((c) => ({
      ...c, isAssistant: !!c.assistant, initials: c.assistant ? 'AI' : c.initials, author: c.assistant ? 'Assistant' : c.author, avatarBg: c.assistant ? 'var(--me-navy)' : c.avatarBg,
      bubbleBg: c.assistant ? 'var(--me-blue-20)' : 'transparent', bubblePad: c.assistant ? '9px 11px' : '0', canAdd: !!c.canAdd, onAdd: () => acceptSuggestion(t),
      tagColor: c.tag === 'Sent for review' ? 'var(--me-blue-deep)' : c.tag === 'Adjustment requested' ? '#946400' : '',
      tagBg: c.tag === 'Sent for review' ? 'var(--me-blue-20)' : c.tag === 'Adjustment requested' ? '#FBEFCF' : '',
    }))
    const chips = [
      { label: 'Find a missing condition', onPick: () => refine('missing') },
      { label: 'Tighten the wording', onPick: () => refine('tighten') },
      { label: 'Check recent cases', onPick: () => refine('cases') },
    ]
    const c = byId[t]
    if (t === 'agent') panelCtx = { kindLabel: 'Agent', title: detailAgent.name, context: detailAgent.description, comments: cmts, empty: cmts.length === 0, hasHistory: false, timeline: [], chips }
    else if (c) panelCtx = { kindLabel: c.id, title: valueOf(c, 'title'), context: (valueOf(c, 'body') || '').split('\n')[0], comments: cmts, empty: cmts.length === 0, hasHistory: true, timeline: c.timeline, chips }
    else { const g = S.agentGroups.find((x) => x.gid === t); panelCtx = { kindLabel: 'Group', title: g ? g.name : '', context: g ? g.desc : '', comments: cmts, empty: cmts.length === 0, hasHistory: false, timeline: [], chips } }
  }

  const addComment = (tag) => {
    const draft = (S.commentDraft || '').trim()
    if (!draft || !S.commentTarget) return
    const entry = { initials: 'WC', author: 'Wei Chen', when: 'just now', avatarBg: 'var(--me-blue)', text: draft, tag }
    setState((s) => ({ comments: { ...s.comments, [s.commentTarget]: [...(s.comments[s.commentTarget] || []), entry] }, commentDraft: '' }))
  }
  if (panelCtx) {
    panelCtx.commentDraft = S.commentDraft
    panelCtx.onDraft = (e) => setState({ commentDraft: e.target.value })
    panelCtx.onClose = () => setState({ panel: null })
    panelCtx.onSendReview = () => addComment('Sent for review')
    panelCtx.onSendAdjust = () => addComment('Adjustment requested')
  }

  const phases = PHASES.map((p) => ({ ...p, scenarios: p.scenarios.map((r) => ({ ...r, mark: r.status === 'pass' ? '✓' : '!', markBg: r.status === 'pass' ? 'var(--status-success)' : 'var(--status-warning)' })) }))
  const reviewOpen = S.panel === 'review' && !!panelCtx
  // Export reads a rule card off its rows, since it has no prose to export.
  const operandText = (o) => (!o ? '?' : o.literal ? o.literal : o.field ? `${docLabel(o.doc)} · ${fieldLabel(o.field)}` : '?')
  const ruleMd = (c) => {
    const r = ruleOf(c.id)
    const blocks = r.groups
      .map((g, gi) => (gi ? `\n\n${g.connector || 'AND'}\n\n` : '') + g.rows.map((x) => `- ${operandText(x.l)} ${opLabel(x.op)}${UNARY_OPS.includes(x.op) ? '' : ' ' + operandText(x.r)}${x.tol ? ` (${x.tol})` : ''}`).join('\n'))
      .join('')
    return `Applies to: ${r.scope || 'Every presentation'}\n\n${blocks}${r.message ? `\n\nRaise: ${r.message}` : ''}`
  }
  const exportMd = allChecks().map((c) => {
    const t = valueOf(c, 'title'); const sv = valueOf(c, 'severity') || 'MAJOR'; const rf = (valueOf(c, 'refs') || []).join(', ')
    const kind = hasConditions(c) ? 'exact' : typeOf(c)
    const bd = kind === 'exact' ? ruleMd(c) : valueOf(c, 'body') || ''
    return `${CARD_TYPES[kind].label.toUpperCase()} RULE: ${c.id} — ${t}\nSeverity: ${sv}\n\n${bd}${rf ? '\n\nReference: ' + rf : ''}`
  }).join('\n\n---\n\n')
  const usedByArt = (code) => allChecks().filter((c) => (valueOf(c, 'refs') || []).includes(code)).length
  const books = S.books || seedBooks()
  const setBooks = (fn) => setState((s) => ({ books: fn(s.books || seedBooks()) }))
  const active = books.find((b) => b.id === S.activeBookId) || books[0] || { id: '', title: '', subtitle: '', articles: [] }
  const deleteBook = (id) => setState((s) => { const bs = (s.books || seedBooks()).filter((b) => b.id !== id); return { books: bs, activeBookId: s.activeBookId === id ? (bs[0] ? bs[0].id : null) : s.activeBookId } })
  const aidOf = (x) => (x.aid != null ? x.aid : x.code)
  const deleteArticle = (bookId, aid) => {
    gov.deleteArticle(aid).catch(() => {})
    setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.filter((x) => aidOf(x) !== aid) } : b)))
  }
  const deleteSection = (bookId, name) => setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.filter((x) => (x.section || '') !== name) } : b)))
  const bq = (S.bookQuery || '').toLowerCase()
  const bookStrip = books
    .filter((b) => !bq || (b.title + ' ' + b.subtitle).toLowerCase().includes(bq))
    .map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, count: b.articles.length + (b.articles.length === 1 ? ' article' : ' articles'), active: b.id === active.id, onSelect: () => confirmLeave(() => setState({ activeBookId: b.id, libSearch: '' })), onDelete: () => requestConfirm({ title: 'Delete book?', message: `“${b.title}” and its ${b.articles.length} article${b.articles.length === 1 ? '' : 's'} will be permanently removed.`, confirmLabel: 'Delete book', onConfirm: () => deleteBook(b.id) }) }))
  const libQ = (S.libSearch || '').toLowerCase()
  const mkArt = (bookId, a) => {
    const aid = aidOf(a)
    const editing = S.artEditingId === aid
    const n = usedByArt(a.code)
    const patch = (field, v) => setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.map((x) => (aidOf(x) === aid ? { ...x, [field]: v } : x)) } : b)))
    return {
      aid, code: a.code, title: a.title, anchorId: 'art-' + String(aid).replace(/[^a-z0-9]/gi, '-'),
      read: a.read || 'Reading text not yet added — click to write it.', editRead: a.read || '', usedByLabel: n + (n === 1 ? ' check' : ' checks'), isNew: !!a.isNew, editing, notEditing: !editing,
      isNew: !!a.isNew,
      cancelLabel: a.isNew ? 'Discard' : 'Cancel',
      onEdit: () => confirmLeave(() => setState({ artEditingId: aid })),
      onChangeCode: (e) => patch('code', e.target.value),
      onChangeTitle: (e) => patch('title', e.target.value),
      onChangeRead: (e) => patch('read', e.target.value),
      onSave: () => {
        const saved = { ...a, code: (a.code || '').trim(), title: (a.title || '').trim(), read: (a.read || '').trim(), isNew: false }
        setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.map((x) => (aidOf(x) === aid ? saved : x)) } : b)))
        gov.saveArticle({ ...saved, bookId }).catch(() => {})
        setState({ artEditingId: null })
      },
      // Discard on an article that was never written removes it, the same rule
      // the check cards follow: Cancel reverts, Discard un-creates.
      onCancel: () => { if (a.isNew) deleteArticle(bookId, aid); setState({ artEditingId: null }) },
      onDelete: () => requestConfirm({ title: 'Delete article?', message: `“${a.title}” will be removed from this book.`, confirmLabel: 'Delete article', onConfirm: () => deleteArticle(bookId, aid) }),
    }
  }
  const arts = active.articles.filter((a) => !libQ || (a.code + ' ' + a.title + ' ' + (a.read || '')).toLowerCase().includes(libQ))
  const secOrder = []
  const bySec = {}
  arts.forEach((a) => { const sec = a.section || ''; if (!bySec[sec]) { bySec[sec] = []; secOrder.push(sec) } bySec[sec].push(a) })
  const readerSections = secOrder.map((sec) => {
    const key = active.id + '|' + sec
    const open = !S.tocCollapsed[key]
    return {
      name: sec, hasName: sec !== '', key, open, caret: open ? 'chevron-down' : 'chevron-right', count: bySec[sec].length,
      onToggle: () => setState((x) => ({ tocCollapsed: { ...x.tocCollapsed, [key]: !x.tocCollapsed[key] } })),
      onAddArticle: guard(() => { const code = uid('ART'); setBooks((bs) => bs.map((b) => (b.id === active.id ? { ...b, articles: [...b.articles, { aid: code, code: '', title: '', section: sec, read: '', isNew: true }] } : b))); setState({ artEditingId: code }) }),
      onDeleteSection: () => requestConfirm({ title: 'Delete section?', message: `All ${bySec[sec].length} article${bySec[sec].length === 1 ? '' : 's'} in “${sec}” will be removed.`, confirmLabel: 'Delete section', onConfirm: () => deleteSection(active.id, sec) }),
      arts: bySec[sec].map((a) => mkArt(active.id, a)),
    }
  })
  const libEmpty = arts.length === 0
  const dictDocs = dictDocList
  const dictFields = dictFieldList
  const setDF = (fn) => setState((s) => ({ dictFields: fn(s.dictFields || seedFields()) }))
  const setDD = (fn) => setState((s) => ({ dictDocs: fn(s.dictDocs || seedDocTypes()) }))
  const docKeys = docKeyBook
  const bindingDocs = (f) => (f.bindings || []).map((b) => b.doc)
  // A field counts as used when a rule names it — as a chip on a judged
  // card, as a braced token in its wording, or as an operand of a rule row.
  const fieldUsed = (key) =>
    allChecks().filter((c) => {
      const fs = valueOf(c, 'fields') || (CHECK_DEFAULTS[c.id] || {}).fields || []
      if (fs.includes(key)) return true
      if (typeOf(c) === 'exact') return ruleFieldsOf(c.id).includes(key)
      // The body braces the name, not the key — it is prose.
      return (valueOf(c, 'body') || '').includes('{' + fieldLabel(key) + '}')
    }).length
  const dq = (S.dictSearch || '').toLowerCase()
  const patchField = (id, fn) => setDF((fs) => fs.map((x) => (x.id === id ? fn(x) : x)))
  // A dictionary row edits the way a check card does: focus starts an edit, a
  // snapshot is taken so Cancel can put it back, and Save trims and commits.
  // Live-mutating every keystroke was the odd one out here — and it made "discard
  // your changes" impossible to honour, because there was nothing to go back to.
  const dictEdit = (id, snap) => {
    const editing = S.editingId === id
    const created = S.createdId === id
    const start = () => { if (S.editingId !== id) setState((st) => ({ editingId: id, editSnap: st.editSnap[id] !== undefined ? st.editSnap : { ...st.editSnap, [id]: snap } })) }
    return { editing, created, locked: !!S.editingId && !editing, start }
  }
  const dictClose = (extra) => setState((st) => { const es = { ...st.editSnap }; delete es[extra.id]; return { editingId: null, createdId: null, editSnap: es, dictDocPickerId: null } })

  const buildFieldRow = (f) => {
    const e = dictEdit(f.id, JSON.parse(JSON.stringify(f)))
    return {
    id: f.id, name: f.name, description: f.description,
    isNew: S.createdId === f.id,
    editing: e.editing, locked: e.locked,
    onFocus: e.start,
    cancelLabel: e.created ? 'Discard' : 'Cancel',
    // What a field cannot be saved without. A nameless field cannot be found again
    // or cited by a check; a description-less one goes into the extraction prompt as
    // a bare key, which is the model's only clue about what it is being asked for.
    nameMissing: isBlank(f.name),
    descMissing: isBlank(f.description),
    // Conditional, and it is the interesting one. Adding a source is optional —
    // an author may name a field before deciding where it is read from — but a
    // source that has been added and left blank is worse than no source at all:
    // the extraction prompt then asks for the field on that document with no
    // instruction, and the model guesses. Required until the row is removed.
    notesMissing: (f.bindings || []).filter((b) => isBlank(b.note)).length,
    canSave: allPresent(f.name, f.description)
      && (f.bindings || []).every((b) => !isBlank(b.note)),
    saveBlockedWhy: isBlank(f.name)
      ? 'Give it a name first.'
      : isBlank(f.description) ? 'Say what it holds — the extraction prompt is built from this.'
      : (f.bindings || []).some((b) => isBlank(b.note))
        ? 'Every document you have added needs a read note — or take the document off.'
        : '',
    onSave: () => {
      if (!allPresent(f.name, f.description)) return
      if ((f.bindings || []).some((b) => isBlank(b.note))) return
      const saved = { ...f, name: (f.name || '').trim(), description: (f.description || '').trim(),
                      bindings: (f.bindings || []).map((b) => ({ ...b, note: (b.note || '').trim() })) }
      setDF((fs) => fs.map((x) => (x.id === f.id ? saved : x)))
      persistField(saved)
      dictClose(f)
    },
    onCancel: () => {
      if (e.created) { setDF((fs) => fs.filter((x) => x.id !== f.id)); dictClose(f); setState({ dictDetail: null }); return }
      const snap = S.editSnap[f.id]
      if (snap) setDF((fs) => fs.map((x) => (x.id === f.id ? snap : x)))
      dictClose(f)
    },
    onOpen: () => confirmLeave(() => setState({ dictDetail: { kind: 'field', id: f.id } })),
    usedLabel: fieldUsed(f.key) + (fieldUsed(f.key) === 1 ? ' check' : ' checks'),
    docsLine: bindingDocs(f).map(docLabel).join(' · ') || '—',
    onChangeName: (ev) => { e.start(); const val = ev.target.value; patchField(f.id, (x) => ({ ...x, name: val })) },
    onChangeDesc: (ev) => { e.start(); const val = ev.target.value; patchField(f.id, (x) => ({ ...x, description: val })) },
    usedCount: fieldUsed(f.key),
    removeTip: S.createdId === f.id ? 'Discard this new field' : 'Remove this field',
    onRemove: () => {
      // Just added and nothing has been said about it yet — no confirm to read.
      if (S.createdId === f.id) { setDF((fs) => fs.filter((x) => x.id !== f.id)); setState({ createdId: null, dictDetail: null }); return }
      const used = fieldUsed(f.key)
      return used
        ? requestConfirm({
            title: 'This field is in use',
            message: `${used} check${used === 1 ? '' : 's'} read “${f.name}”. Removing it would leave them referring to a field that does not exist, and the extraction prompt built from them would go out broken. Take it out of those checks first.`,
            blocked: true,
          })
        : requestConfirm({
            title: 'Delete field?',
            message: `“${f.name}” is not read by any check. It will be removed from the dictionary.`,
            confirmLabel: 'Delete field',
            onConfirm: () => { setDF((fs) => fs.filter((x) => x.id !== f.id)); gov.deleteField(f.key).catch(() => {}); setState({ dictDetail: null }) },
          })
    },
    // Each source carries one note: what the field is called on that document
    // and how to read it. That note is the whole extraction instruction.
    bindings: (f.bindings || []).map((b, i) => {
      const patchBinding = (fn) => patchField(f.id, (x) => ({ ...x, bindings: x.bindings.map((y, j) => (j === i ? fn(y) : y)) }))
      return {
        doc: docLabel(b.doc), note: b.note || '',
        noteMissing: isBlank(b.note),
        onChangeNote: (ev) => { e.start(); const val = ev.target.value; patchBinding((y) => ({ ...y, note: val })) },
        // What this document calls the field, when it does not call it what the
        // dictionary does. An invoice says "total", "grand total", "amount due";
        // the reading is folded back onto this key by whichever matches. Comma
        // separated because that is how a person lists three synonyms.
        aliases: (b.aliases || []).join(', '),
        onChangeAliases: (ev) => {
          e.start()
          const list = ev.target.value.split(',').map((x) => x.trim()).filter(Boolean)
          patchBinding((y) => (list.length ? { ...y, aliases: list } : (({ aliases, ...rest }) => rest)(y)))
        },
        onRemove: () => { e.start(); patchField(f.id, (x) => ({ ...x, bindings: x.bindings.filter((y, j) => j !== i) })) },
      }
    }),
    // What kind of value this holds. It goes into the extraction prompt beside the
    // field — "expiry_date — Expiry date (date)" — so the model is told to return a
    // date rather than left to infer it from the name.
    valueType: f.valueType || 'STRING',
    valueTypes: VALUE_TYPES,
    onChangeValueType: (ev) => { e.start(); const val = ev.target.value; patchField(f.id, (x) => ({ ...x, valueType: val })) },
    pickerOpen: S.dictDocPickerId === f.id,
    onTogglePicker: () => setState((s) => ({ dictDocPickerId: s.dictDocPickerId === f.id ? null : f.id })),
    docBook: docKeys.filter((dk) => !bindingDocs(f).includes(dk)).map((dk) => ({ name: docLabel(dk), onAdd: () => { e.start(); patchField(f.id, (x) => ({ ...x, bindings: [...(x.bindings || []), { doc: dk, note: '' }] })); setState({ dictDocPickerId: null }) } })),
  }}
  const docUsed = (key) => dictFields.filter((f) => bindingDocs(f).includes(key)).length
  const buildDocRow = (d) => {
    const e = dictEdit(d.id, JSON.parse(JSON.stringify(d)))
    return {
    id: d.id, key: d.key, name: d.name, description: d.description, isNew: S.createdId === d.id,
    editing: e.editing, locked: e.locked, onFocus: e.start,
    cancelLabel: e.created ? 'Discard' : 'Cancel',
    // A document type cannot be saved without a code — it is the primary key, and the
    // service refuses it — nor without a name, which is what every screen shows, nor a
    // description, which is what the classifier is given to recognise a page by.
    keyMissing: isBlank(d.key),
    keyTaken: !isBlank(d.key) && dictDocs.some((x) => x.id !== d.id
      && String(x.key).trim().toUpperCase() === String(d.key).trim().toUpperCase()),
    nameMissing: isBlank(d.name),
    descMissing: isBlank(d.description),
    canSave: allPresent(d.key, d.name, d.description)
      && !dictDocs.some((x) => x.id !== d.id
        && String(x.key).trim().toUpperCase() === String(d.key).trim().toUpperCase()),
    saveBlockedWhy: isBlank(d.key)
      ? 'Give it a code first — everything cites this document by it.'
      : dictDocs.some((x) => x.id !== d.id && String(x.key).trim().toUpperCase() === String(d.key).trim().toUpperCase())
        ? 'Another document type already uses this code.'
        : isBlank(d.name) ? 'Give it a name.'
        : isBlank(d.description) ? 'Describe it — this is what the classifier recognises a page by.' : '',
    onSave: () => {
      const key = (d.key || '').trim().toUpperCase()
      if (!allPresent(key, d.name, d.description)) return
      if (dictDocs.some((x) => x.id !== d.id && String(x.key).trim().toUpperCase() === key)) return
      const saved = { ...d, key, name: (d.name || '').trim(), description: (d.description || '').trim() }
      setDD((ds) => ds.map((x) => (x.id === d.id ? saved : x)))
      persistDocType(saved)
      dictClose(d)
    },
    onCancel: () => {
      if (e.created) { setDD((ds) => ds.filter((x) => x.id !== d.id)); dictClose(d); setState({ dictDetail: null }); return }
      const snap = S.editSnap[d.id]
      if (snap) setDD((ds) => ds.map((x) => (x.id === d.id ? snap : x)))
      dictClose(d)
    },
    usedLabel: docUsed(d.key) + (docUsed(d.key) === 1 ? ' field' : ' fields'),
    onOpen: () => confirmLeave(() => setState({ dictDetail: { kind: 'doc', id: d.id } })),
    // The key is identity. Once a field is read from this document — or a case has
    // classified a page as one — everything that cites it cites the code, so a rename
    // would orphan facts in examinations that are already closed and audited. Editable
    // until it is used, then fixed; the name and description never lock.
    keyLocked: docUsed(d.key) > 0 && S.createdId !== d.id,
    keyLockedWhy: 'In use by ' + docUsed(d.key) + ' field' + (docUsed(d.key) === 1 ? '' : 's') + ' — the code is what they are stored against.',
    onChangeKey: (ev) => { e.start(); const val = ev.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, key: val } : x))) },
    onChangeName: (ev) => { e.start(); const val = ev.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: val } : x))) },
    onChangeDesc: (ev) => { e.start(); const val = ev.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, description: val } : x))) },
    // What this document IS to an examination, when it is anything in particular. The
    // credit carries the terms; the schedule carries the presentation date. Everything
    // else is just a document type, and that is the common case — so "none" is first.
    role: d.role || '',
    roleOptions: DOC_ROLES,
    roleTaken: (r) => dictDocs.some((x) => x.role === r && x.id !== d.id),
    onChangeRole: (ev) => { e.start(); const val = ev.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? (val ? { ...x, role: val } : (({ role, ...rest }) => rest)(x)) : (x.role === val && val ? (({ role, ...rest }) => rest)(x) : x)))) },
    usedCount: docUsed(d.key),
    // What this document is read for. The reverse of the dictionary's own direction,
    // derived rather than stored — a note has one home, on the field, so the two have
    // nowhere to drift apart. Read-only here for the same reason.
    readFields: (fieldsByDoc[d.key] || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    removeTip: S.createdId === d.id ? 'Discard this new document type' : 'Remove this document type',
    onRemove: () => {
      if (S.createdId === d.id) { setDD((ds) => ds.filter((x) => x.id !== d.id)); setState({ createdId: null, dictDetail: null }); return }
      const used = docUsed(d.key)
      return used
        ? requestConfirm({
            title: 'This document type is in use',
            message: `${used} field${used === 1 ? '' : 's'} are extracted from “${d.name}”. Removing it would leave those fields with nothing to read from. Reassign them first.`,
            blocked: true,
          })
        : requestConfirm({
            title: 'Delete document type?',
            message: `No field is extracted from “${d.name}”. It will be removed from the dictionary.`,
            confirmLabel: 'Delete document type',
            onConfirm: () => { setDD((ds) => ds.filter((x) => x.id !== d.id)); gov.deleteDocType(d.key).catch(() => {}); setState({ dictDetail: null }) },
          })
    },
  }}
  // Sorted, except while an item is being added: a row that reorders itself out
  // from under the cursor as you type its name is worse than an unsorted list.
  const dictSort = S.createdId ? { key: 'none', dir: 'asc' } : S.dictSort
  const FIELD_SORT = { name: (r) => r.name, description: (r) => r.description || '', sources: (r) => r.bindings.length, used: (r) => r.usedCount }
  const DOC_SORT = { key: (r) => r.key, name: (r) => r.name, description: (r) => r.description || '', used: (r) => r.usedCount }
  const fieldRows0 = dictFields.filter((f) => !dq || (f.name + ' ' + (f.description || '') + ' ' + bindingDocs(f).join(' ') + ' ' + (f.bindings || []).map((b) => b.note || '').join(' ')).toLowerCase().includes(dq)).map(buildFieldRow)
  const docRows0 = dictDocs.filter((d) => !dq || (d.key + ' ' + d.name + ' ' + (d.description || '')).toLowerCase().includes(dq)).map(buildDocRow)
  const fieldRows = FIELD_SORT[dictSort.key] ? sortBy(fieldRows0, FIELD_SORT[dictSort.key], dictSort.dir) : fieldRows0
  const docRows = DOC_SORT[dictSort.key] ? sortBy(docRows0, DOC_SORT[dictSort.key], dictSort.dir) : docRows0
  const dictSortCol = (key) => ({ active: dictSort.key === key, dir: dictSort.dir, onSort: () => setState((x) => ({ dictSort: nextSort(x.dictSort, key), createdId: null })) })
  let dictDetail = null
  if (S.dictDetail) {
    if (S.dictDetail.kind === 'field') { const f = dictFields.find((x) => x.id === S.dictDetail.id); if (f) dictDetail = { kind: 'field', row: buildFieldRow(f) } }
    else { const dd = dictDocs.find((x) => x.id === S.dictDetail.id); if (dd) dictDetail = { kind: 'doc', row: buildDocRow(dd) } }
    if (dictDetail) dictDetail.onBack = () => confirmLeave(() => setState({ dictDetail: null }))
  }
  // What to call the thing that is holding the edit slot.
  const pendingLabel = (() => {
    if (!pendingId) return ''
    const c = allChecks().find((x) => x.id === pendingId)
    if (c) return c.id
    const f = dictFields.find((x) => x.id === pendingId)
    if (f) return f.name ? `“${f.name}”` : 'the new field'
    const d = dictDocs.find((x) => x.id === pendingId)
    if (d) return d.name ? `“${d.name}”` : 'the new document type'
    const bk = books.find((x) => x.id === pendingId)
    if (bk) return `“${bk.title}”`
    for (const b of books) {
      const a = b.articles.find((x) => aidOf(x) === pendingId)
      if (a) return a.code || 'the new article'
    }
    return 'the item you started'
  })()

  const importItems = (S.importItems || []).map((it, i) => ({ ...it, onToggle: () => setState((s) => ({ importItems: s.importItems.map((x, j) => (j === i ? { ...x, include: !x.include } : x)) })), mark: it.include ? '✓' : '', markBg: it.include ? 'var(--me-blue)' : '#fff', markBorder: it.include ? 'var(--me-blue)' : 'var(--me-grey-20)' }))
  const importCount = (S.importItems || []).filter((x) => x.include).length

  return {
    isChecks: section === 'checks' && !checkDetail, isCheckDetail: !!checkDetail, checkDetail,
    isAgentsList: section === 'agents' && view === 'list' && !checkDetail, isAgentDetail: section === 'agents' && view === 'detail' && !checkDetail, isLibrary: section === 'library' && !checkDetail, isDictionary: section === 'dictionary' && !checkDetail,
    goAgents: () => confirmLeave(() => setState({ section: 'agents', view: 'list', panel: null, activeCheckId: null, dictDetail: null })),
    goChecks: () => confirmLeave(() => setState({ section: 'checks', panel: null, activeCheckId: null, dictDetail: null })),
    goLibrary: () => confirmLeave(() => setState({ section: 'library', panel: null, activeCheckId: null, dictDetail: null })),
    goDictionary: () => confirmLeave(() => setState({ section: 'dictionary', panel: null, activeCheckId: null, dictDetail: null })),
    // The module's tab bar owns the URL, so it asks through here.
    confirmLeave,
    section,

    // Reference library (single page: book strip + reader)
    bookStrip, bookQuery: S.bookQuery, setBookQuery: (e) => setState({ bookQuery: e.target.value }),
    onDeleteActiveBook: () => requestConfirm({ title: 'Delete book?', message: `“${active.title}” and its ${active.articles.length} article${active.articles.length === 1 ? '' : 's'} will be permanently removed.`, confirmLabel: 'Delete book', onConfirm: () => deleteBook(active.id) }),
    activeTitle: active.title, activeSubtitle: active.subtitle, readerSections, libEmpty,
    addBook: guard(() => { const id = uid('book'); setBooks((bs) => prepend(bs, { id, title: 'New book', subtitle: 'Untitled reference', articles: [] })); setState({ activeBookId: id, createdId: id }) }),
    addSection: guard(() => { const id = active.id; const code = uid('ART'); setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, articles: [...b.articles, { aid: code, code: '', title: '', section: 'New section', read: '', isNew: true }] } : b))); setState({ artEditingId: code, libAddOpen: false }) }),
    addArticle: guard(() => { const id = active.id; const code = uid('ART'); setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, articles: [...b.articles, { aid: code, code: '', title: '', section: '', read: '', isNew: true }] } : b))); setState({ artEditingId: code, libAddOpen: false }) }),
    addMenuOpen: S.libAddOpen, toggleAddMenu: () => setState((s) => ({ libAddOpen: !s.libAddOpen })),
    libSearch: S.libSearch, setLibSearch: (e) => setState({ libSearch: e.target.value }),

    // Import modal
    importName: S.importName, setImportName: (e) => setState({ importName: e.target.value }),
    importBook: () => { const items = (S.importItems || []).filter((x) => x.include); const id = uid('book'); const nb = { id, title: (S.importName || '').trim() || 'Imported book', subtitle: 'Imported from PDF', articles: items.map((it) => ({ aid: uid('A'), code: it.code, title: it.title, section: it.section || '', read: 'Imported from the uploaded PDF; the assistant split this out — edit the reading text as needed.', isNew: true })) }; setBooks((bs) => [...bs, nb]); setState({ importOpen: false, importName: '', activeBookId: id }) },
    importOpen: S.importOpen, importUpload: S.importStage === 'upload', importReview: S.importStage === 'review', importItems, importCount,
    openImport: () => setState({ importOpen: true, importStage: 'upload', importItems: [] }),
    closeImport: () => setState({ importOpen: false }),
    startImport: () => setState({ importStage: 'review', importItems: [
      { code: '§1.1', title: 'Scope and application', section: 'Chapter 1 — General', include: true },
      { code: '§1.2', title: 'Definitions and interpretation', section: 'Chapter 1 — General', include: true },
      { code: '§2.1', title: 'Presentation of documents', section: 'Chapter 2 — Presentation', include: true },
      { code: '§2.2', title: 'Examination and time limits', section: 'Chapter 2 — Presentation', include: true },
    ] }),

    // Dictionary
    dictIsFields: S.dictTab !== 'doctypes', dictIsDocs: S.dictTab === 'doctypes',
    setDictFieldsTab: () => confirmLeave(() => setState({ dictTab: 'fields', dictDetail: null })), setDictDocsTab: () => confirmLeave(() => setState({ dictTab: 'doctypes', dictDetail: null })),
    dictFieldsBg: S.dictTab !== 'doctypes' ? 'var(--me-blue)' : '#fff', dictFieldsFg: S.dictTab !== 'doctypes' ? '#fff' : 'var(--me-grey-70)',
    dictDocsBg: S.dictTab === 'doctypes' ? 'var(--me-blue)' : '#fff', dictDocsFg: S.dictTab === 'doctypes' ? '#fff' : 'var(--me-grey-70)',
    dictIsCards: S.dictView === 'cards', dictIsListView: S.dictView === 'list',
    setDictCards: () => setState({ dictView: 'cards' }), setDictListView: () => setState({ dictView: 'list' }),
    dictCardsBg: S.dictView === 'cards' ? 'var(--me-blue)' : '#fff', dictCardsFg: S.dictView === 'cards' ? '#fff' : 'var(--me-grey-70)',
    dictListBg: S.dictView === 'list' ? 'var(--me-blue)' : '#fff', dictListFg: S.dictView === 'list' ? '#fff' : 'var(--me-grey-70)',
    dictSearch: S.dictSearch, setDictSearch: (e) => setState({ dictSearch: e.target.value }),
    fieldRows, docRows, isDictDetail: !!dictDetail, dictDetail, dictSortCol,
    dictCountLabel: (S.dictTab === 'doctypes' ? docRows.length : fieldRows.length) + ' of ' + (S.dictTab === 'doctypes' ? dictDocs.length : dictFields.length),
    // Same rule as the checks list — see `newCheck`. From cards, prepend and edit in
    // place; from list, open the new row on its own page rather than switching the
    // section to cards underneath the person who pressed Add.
    addField: guard(() => {
      const id = uid('f')
      setDF((fs) => prepend(fs, { id, name: '', description: '', bindings: [] }))
      setState((s) => ({
        createdId: id, dictSort: { key: 'none', dir: 'asc' },
        ...(s.dictView === 'list' ? { dictDetail: { kind: 'field', id } } : {}),
      }))
    }),
    addDoc: guard(() => {
      const id = uid('d')
      setDD((ds) => prepend(ds, { id, key: '', name: '', description: '' }))
      setState((s) => ({
        createdId: id, dictSort: { key: 'none', dir: 'asc' },
        ...(s.dictView === 'list' ? { dictDetail: { kind: 'doc', id } } : {}),
      }))
    }),

    // Nav state
    navChecksBorder: section === 'checks' ? 'var(--me-blue)' : 'transparent', navChecksColor: section === 'checks' ? 'var(--me-ink)' : 'var(--me-grey-70)', navChecksWeight: section === 'checks' ? 700 : 500,
    navAgentsBorder: section === 'agents' ? 'var(--me-blue)' : 'transparent', navAgentsColor: section === 'agents' ? 'var(--me-ink)' : 'var(--me-grey-70)', navAgentsWeight: section === 'agents' ? 700 : 500,
    navDictBorder: section === 'dictionary' ? 'var(--me-blue)' : 'transparent', navDictColor: section === 'dictionary' ? 'var(--me-ink)' : 'var(--me-grey-70)', navDictWeight: section === 'dictionary' ? 700 : 500,
    navLibraryBorder: section === 'library' ? 'var(--me-blue)' : 'transparent', navLibraryColor: section === 'library' ? 'var(--me-ink)' : 'var(--me-grey-70)', navLibraryWeight: section === 'library' ? 700 : 500,

    // Checks library
    libChecks, libCount: allChecks().length,
    isChecksCards: S.density === 'cards', isChecksList: S.density === 'list',
    setChecksCards: () => setState({ density: 'cards' }), setChecksList: () => setState({ density: 'list' }),
    checksCardsBg: S.density === 'cards' ? 'var(--me-blue)' : '#fff', checksCardsFg: S.density === 'cards' ? '#fff' : 'var(--me-grey-70)',
    checksListBg: S.density === 'list' ? 'var(--me-blue)' : '#fff', checksListFg: S.density === 'list' ? '#fff' : 'var(--me-grey-70)',
    search: S.search, setSearch: (e) => setState({ search: e.target.value }),
    exportHref: encodeURIComponent(exportMd),
    typeFilters,
    addBlocked: !!pendingId,
    pending: pendingId ? { id: pendingId, label: pendingLabel, onGo: () => focusItem(pendingId) } : null,
    checkSortCol,
    checkGroups,
    checkGroupBy: groupBy,
    groupByOptions: Object.entries(GROUPERS).map(([id, g]) => ({ value: id, label: g ? `Group by ${g.label.toLowerCase()}` : 'No grouping' })),
    setCheckGroupBy: (e) => setState({ checkGroupBy: e.target.value }),
    // Two kinds of card, so the "New check" button is a choice, not a default.
    newMenuOpen: S.newMenuOpen,
    toggleNewMenu: () => setState((s) => ({ newMenuOpen: !s.newMenuOpen })),
    closeNewMenu: () => setState({ newMenuOpen: false }),
    newTypes: ['exact', 'judged'].map((t) => ({
      id: t, label: CARD_TYPES[t].label + ' rule', desc: CARD_TYPES[t].hint,
      icon: CARD_TYPES[t].icon, color: CARD_TYPES[t].color, bg: CARD_TYPES[t].bg,
      onPick: guard(() => newCheck(t)),
    })),
    newCheck: guard(() => newCheck('judged')),

    // Agents list
    newAgent: guard(() => setState((s) => { const id = uid('agent'); const a = { id, name: 'New agent', cat: 'Uncategorised', status: 'Draft', statusTone: 'neutral', cov: '', covColor: 'var(--me-grey-70)', summary: 'What this agent reads.', eyebrow: '', description: '', domainId: '', owner: '', version: '', icon: 'bot', accent: '#525355', behavior: '', config: { tools: [] } }; return { extraAgents: [...s.extraAgents, a], section: 'agents', view: 'detail', activeAgentId: id, detailTab: 'checkpoints', panel: null } })),
    agents: allAgents().filter((a) => !S.deletedAgentIds[a.id]).map((raw) => withEdits(raw)).map((a) => ({
      ...a,
      accentSoft: a.accent ? a.accent + '1A' : 'var(--me-grey-08)',
      cps: allChecks().filter((c) => placementOf(c).agentId === a.id).length,
      groups: S.agentGroups.filter((g) => g.agentId === a.id).length,
      onOpen: () => confirmLeave(() => setState({ section: 'agents', view: 'detail', activeAgentId: a.id, detailTab: 'checkpoints', panel: null })),
      onDelete: () => requestConfirm({ title: 'Delete agent?', message: `“${a.name}” will be removed. Its checks return to the unassigned pool — they aren't deleted.`, confirmLabel: 'Delete agent', onConfirm: () => deleteAgent(a.id) }),
    })),
    // Active agent (drives the detail header + config tab)
    agentName: detailAgent.name, agentEyebrow: detailAgent.eyebrow, agentDescription: detailAgent.description,
    onRenameAgent: (e) => setAgentField(detailAgentId, 'name', e.target.value),
    agentIcon: detailAgent.icon, agentAccent: detailAgent.accent, agentAccentSoft: detailAgent.accent ? detailAgent.accent + '1A' : 'var(--me-grey-08)',
    agentIconPickerOpen: S.agentIconPickerOpen,
    toggleAgentIconPicker: () => setState((s) => ({ agentIconPickerOpen: !s.agentIconPickerOpen })),
    closeAgentIconPicker: () => setState({ agentIconPickerOpen: false }),
    pickAgentIcon: (icon) => { setAgentField(detailAgentId, 'icon', icon); setState({ agentIconPickerOpen: false }) },
    pickAgentAccent: (accent) => setAgentField(detailAgentId, 'accent', accent),
    agentIconOptions: ['calendar-clock', 'clock', 'ship', 'truck', 'plane', 'package', 'receipt', 'file-text', 'scale', 'shield-check', 'shield', 'users', 'user-check', 'globe', 'banknote', 'anchor', 'landmark', 'gavel', 'clipboard-check', 'box'],
    agentAccentOptions: ['#0473EA', '#0E9AA7', '#1F9D3B', '#E8A200', '#7A5AF0', '#E5544E', '#2C3A87', '#525355'],
    agentBehavior: detailAgent.behavior || '', onChangeBehavior: (e) => setAgentField(detailAgentId, 'behavior', e.target.value),
    agentDomainId: detailAgent.domainId, agentBasic: `${detailAgent.cat} · ${detailAgent.owner} · ${detailAgent.version}`,
    isGallery: S.listMode === 'gallery', isListMode: S.listMode === 'list',
    setGallery: () => setState({ listMode: 'gallery' }), setListMode: () => setState({ listMode: 'list' }),
    galleryBg: S.listMode === 'gallery' ? 'var(--me-blue)' : '#fff', galleryFg: S.listMode === 'gallery' ? '#fff' : 'var(--me-grey-70)',
    listBg: S.listMode === 'list' ? 'var(--me-blue)' : '#fff', listFg: S.listMode === 'list' ? '#fff' : 'var(--me-grey-70)',

    // Add-case modal + agent detail controls
    confirm: S.confirm ? { title: S.confirm.title, message: S.confirm.message, confirmLabel: S.confirm.confirmLabel, cancelLabel: S.confirm.cancelLabel, blocked: S.confirm.blocked, acknowledgeLabel: S.confirm.acknowledgeLabel, onCancel: () => setState({ confirm: null }), onConfirm: () => { const fn = S.confirm.onConfirm; setState({ confirm: null }); if (fn) fn() } } : null,
    addOpen: S.addOpen, openAdd: () => setState({ addOpen: true }), closeAdd: () => setState({ addOpen: false }), stop: (e) => { if (e && e.stopPropagation) e.stopPropagation() },
    agentActive: S.agentActive, toggleAgent: (v) => setState({ agentActive: v }),
    openTest: () => setState({ testOpen: true }), closeTest: () => setState({ testOpen: false }), testOpen: S.testOpen, phases,

    isCheckpointsTab: tab === 'checkpoints', isConfigTab: tab === 'config',
    tabCheckpoints: () => setState({ detailTab: 'checkpoints', panel: null }), tabConfig: () => setState({ detailTab: 'config', panel: null }),
    cpTabColor: tab === 'checkpoints' ? 'var(--me-blue)' : 'var(--me-grey-70)', cpTabWeight: tab === 'checkpoints' ? 700 : 500, cpTabBorder: tab === 'checkpoints' ? 'var(--me-blue)' : 'transparent',
    cfgTabColor: tab === 'config' ? 'var(--me-blue)' : 'var(--me-grey-70)', cfgTabWeight: tab === 'config' ? 700 : 500, cfgTabBorder: tab === 'config' ? 'var(--me-blue)' : 'transparent',

    groups, addGroup: guard(() => addGroupFor(detailAgentId)), panelOpen: false,
    reviewOpen, reviewCtx: panelCtx, appPadRight: reviewOpen ? '384px' : '0', closeReview: () => setState({ panel: null }),
    openReviewAgent: (e) => toggleReview('agent', e),
    reviewAnchorY: S.reviewAnchorY, reviewAnchorX: S.reviewAnchorX,
    agentChecksIsList: S.agentChecksView === 'list', agentChecksIsCards: S.agentChecksView === 'cards',
    setAgentChecksList: () => setState({ agentChecksView: 'list' }), setAgentChecksCards: () => setState({ agentChecksView: 'cards' }),
    agentArrange: S.agentArrange, toggleArrange: () => setState((s) => ({ agentArrange: !s.agentArrange, dragGroupGid: null, dragOverGid: null })),
    arrangeBg: S.agentArrange ? 'var(--me-blue)' : '#fff', arrangeFg: S.agentArrange ? '#fff' : 'var(--me-grey)',
    agentChecksListBg: S.agentChecksView === 'list' ? 'var(--me-blue)' : '#fff', agentChecksListFg: S.agentChecksView === 'list' ? '#fff' : 'var(--me-grey-70)',
    agentChecksCardsBg: S.agentChecksView === 'cards' ? 'var(--me-blue)' : '#fff', agentChecksCardsFg: S.agentChecksView === 'cards' ? '#fff' : 'var(--me-grey-70)',
    notesBtnBg: S.panel === 'review' && S.commentTarget === 'agent' ? 'var(--me-blue-20)' : '#fff', notesBtnBorder: S.panel === 'review' && S.commentTarget === 'agent' ? 'var(--me-blue)' : 'var(--me-grey-20)', notesBtnColor: S.panel === 'review' && S.commentTarget === 'agent' ? 'var(--me-blue-deep)' : 'var(--me-grey)',
    commentDraft: S.commentDraft, setDraft: (e) => setState({ commentDraft: e.target.value }), sendReview: () => addComment('Sent for review'), sendAdjust: () => addComment('Adjustment requested'),

    // Config tab
    holistic: S.holistic, toggleHolistic: (v) => setState({ holistic: v }),
    order: S.order, setOrder: (e) => setState({ order: e.target.value }),
    orderOptions: [{ label: 'Severity — high to low', value: 'sev_desc' }, { label: 'Severity — low to high', value: 'sev_asc' }, { label: 'Manual order', value: 'manual' }],
    lcFields: (detailAgent.config?.lcFields) || [],
    docTypes: (detailAgent.config?.docTypes) || [],
    guidance: (detailAgent.config?.guidance) || [],
    anchors: (detailAgent.config?.anchors) || [],
    tools: ((detailAgent.config?.tools) || []).map((t) => ({ name: t.name, mark: t.on ? '✓' : '', bg: t.on ? 'var(--me-blue)' : '#fff', border: t.on ? 'var(--me-blue)' : 'var(--me-grey-20)' })),
  }
}

// Monotonic id source (replaces Date.now() in the design; avoids SSR/randomness).
let _seq = 1
function reqId() {
  return _seq++
}

// Every id minted at runtime goes through here, and every one of them carries a
// hyphen — which no seeded id does.
//
// This is not a style preference. `uid('f')` produced `f1` on the first
// click, and `f1` is the seed's own "Expiry date": the new field and that one
// then shared an id, so patching by id wrote to both and React saw a duplicate
// key. Typing a name into the new field renamed a real one. The same collision
// had already happened once with rule blocks (`g1`). Keeping the two id spaces
// structurally disjoint is the only fix that does not rely on remembering.
function uid(prefix) {
  return `${prefix}-${reqId()}`
}
