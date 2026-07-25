// ============================================================================
// store.js — LC Governance Console state + view-model derivation.
//
// Ported from the claude.ai/design prototype "LC Governance Console.dc.html"
// (DCLogic class). Seed data, the check view-model builder (buildCheck) and the
// per-render derivation (deriveVals) are kept faithful to the design so the
// React components map 1:1 onto the original markup. All data is in-memory mock
// data — the backend service is wired in later.
// ============================================================================

import seed from './data/seed.json' with { type: 'json' }

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
const FIELD_DICT = seed.fieldDict
const DOC_TYPE_BOOK = seed.docTypeBook
const CHECK_DEFAULTS = seed.checkDefaults

const TYPE_META = {
  'LC field': { c: 'var(--me-blue-deep)', b: 'var(--me-blue-20)' },
  'Document data point': { c: '#1F7A00', b: 'var(--me-green-20)' },
  Derived: { c: 'var(--me-navy)', b: 'var(--me-grey-08)' },
  External: { c: '#946400', b: '#FBEFCF' },
}

// ---- Seed builders (document types, dictionary fields, reference books) -----
export function seedDocTypes() {
  const desc = {
    'Commercial invoice': 'Issued by the beneficiary; lists goods, quantities and value.',
    'Bill of lading': "Carrier's receipt and document of title for sea shipment.",
    'Insurance document': 'Evidence of cargo insurance cover.',
    'Air waybill': 'Air carrier receipt evidencing shipment by air.',
    'Packing list': 'Breakdown of how the goods are packed.',
    'Certificate of origin': 'States the country where goods were produced.',
  }
  return DOC_TYPE_BOOK.map((name, i) => ({
    id: 'd' + i,
    key: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
    name,
    description: desc[name] || '',
  }))
}

export function seedFields() {
  const info = {
    '31D': ['The date and place the credit expires.', ['Covering schedule']],
    '41A': ['Bank with which the credit is available, and how.', ['Covering schedule']],
    '41D': ['Bank with which the credit is available, and how.', ['Covering schedule']],
    '44C': ['Latest date the goods may be shipped.', ['Bill of lading', 'Air waybill']],
    '45A': ['Description of the goods, services or performance.', ['Commercial invoice']],
    '32B': ['Currency and amount of the credit.', ['Commercial invoice']],
    '59': ['The party in whose favour the credit is issued.', ['Commercial invoice']],
    '50': ['The party on whose request the credit is issued.', []],
  }
  const base = Object.keys(FIELD_DICT).map((code, i) => ({
    id: 'f' + i, code, name: FIELD_DICT[code], type: 'LC field',
    description: (info[code] || ['', []])[0], docs: (info[code] || ['', []])[1],
  }))
  return base.concat([
    { id: 'fx1', code: 'DOC.OBD', name: 'On-board date', type: 'Document data point', description: 'The shipped-on-board date read from the transport document.', docs: ['Bill of lading', 'Air waybill'] },
    { id: 'fx2', code: 'CALC.PRES', name: 'Presentation date', type: 'Derived', description: 'The date documents were presented, taken from the covering schedule stamp.', docs: ['Covering schedule'] },
    { id: 'fx3', code: 'EXT.SANCTIONS', name: 'Sanctions match', type: 'External', description: 'Whether any named party, vessel or port hits a restricted-party list.', docs: [] },
  ])
}

export function seedBooks() {
  const rd = (code) => (ARTICLE_INFO[code] || {}).read || ''
  const ucp = REF_BOOK.filter((b) => b.code.indexOf('ISBP') !== 0).map((b) => ({ aid: b.code, code: b.code, title: b.desc, section: '', read: rd(b.code) }))
  const isbpSec = { 'ISBP821 A': 'General principles', 'ISBP821 E': 'Transport documents' }
  const isbp = REF_BOOK.filter((b) => b.code.indexOf('ISBP') === 0).map((b) => ({ aid: b.code, code: b.code, title: b.desc, section: isbpSec[b.code] || '', read: rd(b.code) }))
  return [
    { id: 'ucp600', title: 'UCP 600', subtitle: 'Uniform Customs & Practice for Documentary Credits', articles: ucp },
    { id: 'isbp821', title: 'ISBP 821', subtitle: 'International Standard Banking Practice', articles: isbp },
  ]
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
  editingId: null, overrides: {}, editSnap: {}, refsOpenId: null, helpOpenId: null,
  panel: null, commentTarget: null, commentDraft: '',
  holistic: true, order: 'sev_desc', testOpen: false,
  search: '',
  extraChecks: [], newSeq: 0,
  addMenuGid: null, assignOpenId: null, fieldsOpenId: null, docsOpenId: null,
  importOpen: false, importStage: 'upload', importItems: [], importName: '', books: null, activeBookId: null, libSearch: '', tocCollapsed: {}, artEditingId: null, libAddOpen: false,
  dictTab: 'fields', dictView: 'list', dictSearch: '', dictDetail: null, dictFields: null, dictDocs: null, dictDocPickerId: null,
  density: 'list', expandedIds: {}, placements: {}, activeCheckId: null,
  dragId: null, dragOverGid: null, dragGroupGid: null, activeAgentId: 'expiry', checkFrom: null,
  agentChecksView: 'list', agentArrange: false, reviewAnchorY: null, reviewAnchorX: null, confirm: null, bookQuery: '',
  inactiveIds: {}, deletedCheckIds: {}, deletedAgentIds: {}, agentEdits: {}, agentIconPickerOpen: false, extraAgents: [],
  agentGroups: seed.groups,
  comments: seed.comments,
}

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
  const allChecks = () => CHECKS.concat(S.extraChecks).filter((c) => !S.deletedCheckIds[c.id])
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
  const fieldName = (code) => { const f = dictFieldList.find((x) => x.code === code); return f ? f.name : FIELD_DICT[code] || 'LC field' }

  const assignCheck = (id, agentId) =>
    setState((s) => ({ placements: { ...s.placements, [id]: { agentId, groupId: agentId ? firstGroupOf(agentId) : null } }, assignOpenId: null }))
  const assignToGroup = (id, gid, agentId) =>
    setState((s) => ({ placements: { ...s.placements, [id]: { agentId, groupId: gid } }, addMenuGid: null }))
  const renameGroup = (gid, name) => setState((s) => ({ agentGroups: s.agentGroups.map((x) => (x.gid === gid ? { ...x, name } : x)) }))
  const addGroupFor = (agentId) => setState((s) => { const n = s.agentGroups.filter((x) => x.agentId === agentId).length + 1; return { agentGroups: [...s.agentGroups, { agentId, gid: 'G' + reqId(), name: 'Group ' + n }] } })
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
  const toggleInactive = (id) => setState((s) => ({ inactiveIds: { ...s.inactiveIds, [id]: !s.inactiveIds[id] } }))
  const deleteAgent = (id) => setState((s) => {
    const placements = { ...s.placements }
    allChecks().forEach((c) => { const cur = s.placements[c.id] || { agentId: c.agentId || null, groupId: c.groupId || null }; if (cur.agentId === id) placements[c.id] = { agentId: null, groupId: null } })
    return { deletedAgentIds: { ...s.deletedAgentIds, [id]: true }, agentGroups: s.agentGroups.filter((g) => g.agentId !== id), placements, activeAgentId: s.activeAgentId === id ? null : s.activeAgentId, view: s.activeAgentId === id ? 'list' : s.view }
  })
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
    const inactive = !!S.inactiveIds[c.id]
    // A check that has examined a case is referenced by the findings it produced
    // and by any refusal advice quoting them. Deleting it orphans that record, so
    // only a draft that never ran can be deleted; everything else is retired.
    const timesUsed = c.cases || 0
    const deletable = !!c.draft && timesUsed === 0
    const cc = S.comments[c.id] || []
    const inAgent = ctx === 'agent'
    const snapNow = { title, severity, refs: [...refs], body, fields: [...fields], docs: [...docs] }
    const startEdit = () => {
      if (S.editingId !== c.id) setState((s) => ({ editingId: c.id, editSnap: s.editSnap[c.id] !== undefined ? s.editSnap : { ...s.editSnap, [c.id]: snapNow } }))
    }
    const write = (field, val) =>
      setState((s) => {
        const base = s.overrides[c.id] || snapNow
        return {
          editingId: c.id,
          editSnap: s.editSnap[c.id] !== undefined ? s.editSnap : { ...s.editSnap, [c.id]: snapNow },
          overrides: { ...s.overrides, [c.id]: { ...base, [field]: val } },
        }
      })
    const compactMode = false
    const expanded = !!S.expandedIds[c.id]
    const showBody = editing || !compactMode || expanded
    const detectCodes = () => {
      const cds = []
      const seen = {}
      const fre = /\{\s*([0-9]{2}[A-Z]?)\s*\}/g
      let fm
      while ((fm = fre.exec(body)) !== null) {
        if (!seen[fm[1]]) {
          seen[fm[1]] = 1
          cds.push(fm[1])
        }
      }
      return cds
    }
    const place = placementOf(c)
    const inLabel = place.agentId ? agentName(place.agentId) + (place.groupId ? ' · ' + groupName(place.groupId) : '') : 'Not in an agent'
    const preview = (body.split('\n').find((l) => l.trim()) || '').replace(/[{}]/g, '')
    return {
      id: c.id, title, body, bodySegments: hl(body), dictFields: dictFieldList.filter((f) => f.code).map((f) => ({ code: f.code, name: f.name })), severity,
      sevColor: (SEV_META[severity] || SEV_META.MAJOR).color,
      onChangeSev: (e) => write('severity', e.target.value),
      fieldChips: fields.map((cd) => ({ code: cd, name: fieldName(cd), onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('fields', fields.filter((x) => x !== cd)) } })),
      hasFields: fields.length > 0,
      fieldBook: dictFieldList.filter((f) => f.code && !fields.includes(f.code)).map((f) => ({ code: f.code, name: f.name, onAdd: () => { write('fields', [...fields, f.code]); setState({ fieldsOpenId: null }) } })),
      fieldsOpen: S.fieldsOpenId === c.id,
      onToggleFields: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ fieldsOpenId: s.fieldsOpenId === c.id ? null : c.id })) },
      onDetectFields: () => { const merged = fields.slice(); detectCodes().forEach((cd) => { if (!merged.includes(cd)) merged.push(cd) }); write('fields', merged); setState({ fieldsOpenId: null }) },
      docChips: docs.map((d) => ({ name: d, onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('docs', docs.filter((x) => x !== d)) } })),
      hasDocs: docs.length > 0,
      docBook: DOC_TYPE_BOOK.filter((d) => !docs.includes(d)).map((d) => ({ name: d, onAdd: () => { write('docs', [...docs, d]); setState({ docsOpenId: null }) } })),
      docsOpen: S.docsOpenId === c.id,
      onToggleDocs: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ docsOpenId: s.docsOpenId === c.id ? null : c.id })) },
      refChips: refs.map((code) => ({ code, desc: bookDesc(code), onRemove: (e) => { if (e && e.stopPropagation) e.stopPropagation(); write('refs', refs.filter((x) => x !== code)) } })),
      refBook: REF_BOOK.filter((b) => !refs.includes(b.code)).map((b) => ({ code: b.code, desc: b.desc, onAdd: () => { write('refs', [...refs, b.code]); setState({ refsOpenId: null }) } })),
      refsOpen: S.refsOpenId === c.id,
      onToggleRefs: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ refsOpenId: s.refsOpenId === c.id ? null : c.id })) },
      helpOpen: S.helpOpenId === c.id,
      onToggleHelp: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ helpOpenId: s.helpOpenId === c.id ? null : c.id })) },
      casesLabel: c.cases + (c.cases === 1 ? ' linked case' : ' linked cases'),
      draft: !!c.draft,
      commentCount: cc.length, hasComments: cc.length > 0,
      editing, showBody, expanded, showPreview: compactMode && !expanded && !editing, preview,
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
        ? 'Delete this draft'
        : `${c.id} has run on ${timesUsed} case${timesUsed === 1 ? '' : 's'} — retire it instead so the findings that cite it stay readable`,
      onDelete: () =>
        deletable
          ? requestConfirm({
              title: 'Delete draft check?',
              message: `${c.id} “${title}” has never run. It will be permanently removed.`,
              confirmLabel: 'Delete draft',
              onConfirm: () => deleteCheck(c.id),
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
      showInLine: true, inLabel,
      showAssign: !inAgent, assignLabel: place.agentId ? agentName(place.agentId) : 'Add to agent',
      assignBorder: place.agentId ? 'var(--me-blue)' : 'var(--me-grey-20)', assignBg: place.agentId ? 'var(--me-blue-20)' : '#fff', assignColor: place.agentId ? 'var(--me-blue-deep)' : 'var(--me-grey-70)', assignIcon: place.agentId ? 'bot' : 'plus',
      assignOpen: S.assignOpenId === c.id,
      onToggleAssign: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setState((s) => ({ assignOpenId: s.assignOpenId === c.id ? null : c.id })) },
      assignOptions: AGENTS.map((a) => ({ label: a.name, icon: 'bot', bg: place.agentId === a.id ? 'var(--me-blue-20)' : 'transparent', color: 'var(--me-ink)', onPick: () => assignCheck(c.id, a.id) })).concat(
        place.agentId ? [{ label: 'Remove from agent', icon: 'x', bg: 'transparent', color: 'var(--status-error)', onPick: () => assignCheck(c.id, null) }] : []
      ),
      onDragStart: (e) => { setState({ dragId: c.id }); if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id) } catch (x) {} } },
      onFocus: () => startEdit(),
      onChangeTitle: (e) => write('title', e.target.value),
      onChangeBody: (val) => write('body', val), // RuleEditor (CodeMirror) passes the value string directly
      onSave: () => setState((s) => { const es = { ...s.editSnap }; delete es[c.id]; const base = s.overrides[c.id] || snapNow; return { editingId: null, refsOpenId: null, helpOpenId: null, editSnap: es, overrides: { ...s.overrides, [c.id]: { ...base, title: (title || '').trim(), body: (body || '').trim() } } } }),
      onCancel: () => setState((s) => { const snap = s.editSnap[c.id]; const ov = { ...s.overrides }; if (snap === undefined) delete ov[c.id]; else ov[c.id] = snap; const es = { ...s.editSnap }; delete es[c.id]; return { editingId: null, refsOpenId: null, helpOpenId: null, overrides: ov, editSnap: es } }),
      onOpen: () => setState((s) => ({ activeCheckId: c.id, editingId: null, panel: null, checkFrom: { section: s.section, view: s.view, activeAgentId: s.activeAgentId } })),
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
      onBack: () => setState((s) => ({ activeCheckId: null, editingId: null, panel: null, section: from.section, view: from.view || 'list', activeAgentId: from.activeAgentId || s.activeAgentId })),
    }
  }

  const detailGroupCount = S.agentGroups.filter((g) => g.agentId === detailAgentId).length
  const groups = S.agentGroups.filter((g) => g.agentId === detailAgentId).map((g, gi) => {
    const addable = allChecks()
      .filter((c) => { const p = placementOf(c); return !(p.agentId === detailAgentId && p.groupId === g.gid) })
      .map((c) => { const p = placementOf(c); return { title: valueOf(c, 'title'), domain: p.agentId === detailAgentId ? 'move here' : p.agentId ? 'from ' + agentName(p.agentId) : 'unassigned', sevColor: (SEV_META[(valueOf(c, 'severity') || 'MAJOR').toUpperCase()] || SEV_META.MAJOR).color, onAdd: () => assignToGroup(c.id, g.gid, detailAgentId) } })
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
  const libChecks = allChecks()
    .filter((c) => !q || (valueOf(c, 'title') + ' ' + valueOf(c, 'body') + ' ' + (valueOf(c, 'refs') || []).join(' ')).toLowerCase().includes(q))
    .map((c) => buildCheck(c, 'library'))

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
  const exportMd = allChecks().map((c) => { const t = valueOf(c, 'title'); const sv = valueOf(c, 'severity') || 'MAJOR'; const rf = (valueOf(c, 'refs') || []).join(', '); const bd = valueOf(c, 'body') || ''; return 'CHECKPOINT: ' + t + '\nSeverity: ' + sv + '\n\n' + bd + (rf ? '\n\nReference: ' + rf : '') }).join('\n\n---\n\n')
  const usedByArt = (code) => allChecks().filter((c) => (valueOf(c, 'refs') || []).includes(code)).length
  const books = S.books || seedBooks()
  const setBooks = (fn) => setState((s) => ({ books: fn(s.books || seedBooks()) }))
  const active = books.find((b) => b.id === S.activeBookId) || books[0] || { id: '', title: '', subtitle: '', articles: [] }
  const deleteBook = (id) => setState((s) => { const bs = (s.books || seedBooks()).filter((b) => b.id !== id); return { books: bs, activeBookId: s.activeBookId === id ? (bs[0] ? bs[0].id : null) : s.activeBookId } })
  const aidOf = (x) => (x.aid != null ? x.aid : x.code)
  const deleteArticle = (bookId, aid) => setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.filter((x) => aidOf(x) !== aid) } : b)))
  const deleteSection = (bookId, name) => setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.filter((x) => (x.section || '') !== name) } : b)))
  const bq = (S.bookQuery || '').toLowerCase()
  const bookStrip = books
    .filter((b) => !bq || (b.title + ' ' + b.subtitle).toLowerCase().includes(bq))
    .map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, count: b.articles.length + (b.articles.length === 1 ? ' article' : ' articles'), active: b.id === active.id, onSelect: () => setState({ activeBookId: b.id, libSearch: '' }), onDelete: () => requestConfirm({ title: 'Delete book?', message: `“${b.title}” and its ${b.articles.length} article${b.articles.length === 1 ? '' : 's'} will be permanently removed.`, confirmLabel: 'Delete book', onConfirm: () => deleteBook(b.id) }) }))
  const libQ = (S.libSearch || '').toLowerCase()
  const mkArt = (bookId, a) => {
    const aid = aidOf(a)
    const editing = S.artEditingId === aid
    const n = usedByArt(a.code)
    const patch = (field, v) => setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.map((x) => (aidOf(x) === aid ? { ...x, [field]: v } : x)) } : b)))
    return {
      aid, code: a.code, title: a.title, anchorId: 'art-' + String(aid).replace(/[^a-z0-9]/gi, '-'),
      read: a.read || 'Reading text not yet added — click to write it.', editRead: a.read || '', usedByLabel: n + (n === 1 ? ' check' : ' checks'), isNew: !!a.isNew, editing, notEditing: !editing,
      onEdit: () => setState({ artEditingId: aid }),
      onChangeCode: (e) => patch('code', e.target.value),
      onChangeTitle: (e) => patch('title', e.target.value),
      onChangeRead: (e) => patch('read', e.target.value),
      onSave: () => { setBooks((bs) => bs.map((b) => (b.id === bookId ? { ...b, articles: b.articles.map((x) => (aidOf(x) === aid ? { ...x, code: (x.code || '').trim(), title: (x.title || '').trim(), read: (x.read || '').trim() } : x)) } : b))); setState({ artEditingId: null }) },
      onCancel: () => setState({ artEditingId: null }),
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
      onAddArticle: () => { const code = 'ART-' + reqId(); setBooks((bs) => bs.map((b) => (b.id === active.id ? { ...b, articles: [...b.articles, { aid: code, code, title: 'New article', section: sec, read: '', isNew: true }] } : b))); setState({ artEditingId: code }) },
      onDeleteSection: () => requestConfirm({ title: 'Delete section?', message: `All ${bySec[sec].length} article${bySec[sec].length === 1 ? '' : 's'} in “${sec}” will be removed.`, confirmLabel: 'Delete section', onConfirm: () => deleteSection(active.id, sec) }),
      arts: bySec[sec].map((a) => mkArt(active.id, a)),
    }
  })
  const libEmpty = arts.length === 0
  const dictDocs = S.dictDocs || seedDocTypes()
  const dictFields = dictFieldList
  const setDF = (fn) => setState((s) => ({ dictFields: fn(s.dictFields || seedFields()) }))
  const setDD = (fn) => setState((s) => ({ dictDocs: fn(s.dictDocs || seedDocTypes()) }))
  const docNames = dictDocs.map((d) => d.name)
  const fieldUsed = (code) => allChecks().filter((c) => { const fs = valueOf(c, 'fields') || (CHECK_DEFAULTS[c.id] || {}).fields || []; return fs.includes(code) }).length
  const dq = (S.dictSearch || '').toLowerCase()
  const buildFieldRow = (f) => ({
    id: f.id, code: f.code, name: f.name, description: f.description, type: f.type || 'LC field',
    typeColor: (TYPE_META[f.type] || TYPE_META['LC field']).c, typeBg: (TYPE_META[f.type] || TYPE_META['LC field']).b,
    onOpen: () => setState({ dictDetail: { kind: 'field', id: f.id } }),
    onChangeType: (e) => { const v = e.target.value; setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, type: v } : x))) },
    usedLabel: fieldUsed(f.code) + ' checks',
    onChangeCode: (e) => { const v = e.target.value; setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, code: v } : x))) },
    onChangeName: (e) => { const v = e.target.value; setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, name: v } : x))) },
    onChangeDesc: (e) => { const v = e.target.value; setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, description: v } : x))) },
    onBlurDesc: () => setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, description: (x.description || '').trim() } : x))),
    usedCount: fieldUsed(f.code),
    onRemove: () => {
      const used = fieldUsed(f.code)
      return used
        ? requestConfirm({
            title: 'This field is in use',
            message: `${used} check${used === 1 ? '' : 's'} read {${f.code}}. Removing it would leave those rules referring to a field that does not exist, and the extraction prompt built from them would go out broken. Take it out of those checks first.`,
            blocked: true,
          })
        : requestConfirm({
            title: 'Delete field?',
            message: `{${f.code}} is not read by any check. It will be removed from the dictionary.`,
            confirmLabel: 'Delete field',
            onConfirm: () => { setDF((fs) => fs.filter((x) => x.id !== f.id)); setState({ dictDetail: null }) },
          })
    },
    docChips: (f.docs || []).map((dn) => ({ name: dn, onRemove: () => setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, docs: x.docs.filter((y) => y !== dn) } : x))) })),
    pickerOpen: S.dictDocPickerId === f.id,
    onTogglePicker: () => setState((s) => ({ dictDocPickerId: s.dictDocPickerId === f.id ? null : f.id })),
    docBook: docNames.filter((dn) => !(f.docs || []).includes(dn)).map((dn) => ({ name: dn, onAdd: () => { setDF((fs) => fs.map((x) => (x.id === f.id ? { ...x, docs: [...(x.docs || []), dn] } : x))); setState({ dictDocPickerId: null }) } })),
  })
  const buildDocRow = (d) => ({
    id: d.id, key: d.key, name: d.name, description: d.description, usedLabel: dictFields.filter((f) => (f.docs || []).includes(d.name)).length + ' fields',
    onOpen: () => setState({ dictDetail: { kind: 'doc', id: d.id } }),
    onChangeKey: (e) => { const v = e.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, key: v } : x))) },
    onChangeName: (e) => { const v = e.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: v } : x))) },
    onChangeDesc: (e) => { const v = e.target.value; setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, description: v } : x))) },
    onBlurDesc: () => setDD((ds) => ds.map((x) => (x.id === d.id ? { ...x, description: (x.description || '').trim() } : x))),
    usedCount: dictFields.filter((f) => (f.docs || []).includes(d.name)).length,
    onRemove: () => {
      const used = dictFields.filter((f) => (f.docs || []).includes(d.name)).length
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
            onConfirm: () => { setDD((ds) => ds.filter((x) => x.id !== d.id)); setState({ dictDetail: null }) },
          })
    },
  })
  const fieldRows = dictFields.filter((f) => !dq || (f.code + ' ' + f.name + ' ' + (f.description || '') + ' ' + (f.type || '')).toLowerCase().includes(dq)).map(buildFieldRow)
  const docRows = dictDocs.filter((d) => !dq || (d.key + ' ' + d.name + ' ' + (d.description || '')).toLowerCase().includes(dq)).map(buildDocRow)
  let dictDetail = null
  if (S.dictDetail) {
    if (S.dictDetail.kind === 'field') { const f = dictFields.find((x) => x.id === S.dictDetail.id); if (f) dictDetail = { kind: 'field', row: buildFieldRow(f) } }
    else { const dd = dictDocs.find((x) => x.id === S.dictDetail.id); if (dd) dictDetail = { kind: 'doc', row: buildDocRow(dd) } }
    if (dictDetail) dictDetail.onBack = () => setState({ dictDetail: null })
  }
  const importItems = (S.importItems || []).map((it, i) => ({ ...it, onToggle: () => setState((s) => ({ importItems: s.importItems.map((x, j) => (j === i ? { ...x, include: !x.include } : x)) })), mark: it.include ? '✓' : '', markBg: it.include ? 'var(--me-blue)' : '#fff', markBorder: it.include ? 'var(--me-blue)' : 'var(--me-grey-20)' }))
  const importCount = (S.importItems || []).filter((x) => x.include).length

  return {
    isChecks: section === 'checks' && !checkDetail, isCheckDetail: !!checkDetail, checkDetail,
    isAgentsList: section === 'agents' && view === 'list' && !checkDetail, isAgentDetail: section === 'agents' && view === 'detail' && !checkDetail, isLibrary: section === 'library' && !checkDetail, isDictionary: section === 'dictionary' && !checkDetail,
    goAgents: () => setState({ section: 'agents', view: 'list', panel: null, activeCheckId: null, dictDetail: null }),
    goChecks: () => setState({ section: 'checks', panel: null, activeCheckId: null, dictDetail: null }),
    goLibrary: () => setState({ section: 'library', panel: null, activeCheckId: null, dictDetail: null }),
    goDictionary: () => setState({ section: 'dictionary', panel: null, activeCheckId: null, dictDetail: null }),
    section,

    // Reference library (single page: book strip + reader)
    bookStrip, bookQuery: S.bookQuery, setBookQuery: (e) => setState({ bookQuery: e.target.value }),
    onDeleteActiveBook: () => requestConfirm({ title: 'Delete book?', message: `“${active.title}” and its ${active.articles.length} article${active.articles.length === 1 ? '' : 's'} will be permanently removed.`, confirmLabel: 'Delete book', onConfirm: () => deleteBook(active.id) }),
    activeTitle: active.title, activeSubtitle: active.subtitle, readerSections, libEmpty,
    addBook: () => { const id = 'book' + reqId(); setBooks((bs) => [...bs, { id, title: 'New book', subtitle: 'Untitled reference', articles: [] }]); setState({ activeBookId: id }) },
    addSection: () => { const id = active.id; const code = 'ART-' + reqId(); setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, articles: [...b.articles, { aid: code, code, title: 'New article', section: 'New section', read: '', isNew: true }] } : b))); setState({ artEditingId: code, libAddOpen: false }) },
    addArticle: () => { const id = active.id; const code = 'ART-' + reqId(); setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, articles: [...b.articles, { aid: code, code, title: 'New article', section: '', read: '', isNew: true }] } : b))); setState({ artEditingId: code, libAddOpen: false }) },
    addMenuOpen: S.libAddOpen, toggleAddMenu: () => setState((s) => ({ libAddOpen: !s.libAddOpen })),
    libSearch: S.libSearch, setLibSearch: (e) => setState({ libSearch: e.target.value }),

    // Import modal
    importName: S.importName, setImportName: (e) => setState({ importName: e.target.value }),
    importBook: () => { const items = (S.importItems || []).filter((x) => x.include); const id = 'book' + reqId(); const nb = { id, title: (S.importName || '').trim() || 'Imported book', subtitle: 'Imported from PDF', articles: items.map((it) => ({ aid: 'A' + reqId(), code: it.code, title: it.title, section: it.section || '', read: 'Imported from the uploaded PDF; the assistant split this out — edit the reading text as needed.', isNew: true })) }; setBooks((bs) => [...bs, nb]); setState({ importOpen: false, importName: '', activeBookId: id }) },
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
    setDictFieldsTab: () => setState({ dictTab: 'fields', dictDetail: null }), setDictDocsTab: () => setState({ dictTab: 'doctypes', dictDetail: null }),
    dictFieldsBg: S.dictTab !== 'doctypes' ? 'var(--me-blue)' : '#fff', dictFieldsFg: S.dictTab !== 'doctypes' ? '#fff' : 'var(--me-grey-70)',
    dictDocsBg: S.dictTab === 'doctypes' ? 'var(--me-blue)' : '#fff', dictDocsFg: S.dictTab === 'doctypes' ? '#fff' : 'var(--me-grey-70)',
    dictIsCards: S.dictView === 'cards', dictIsListView: S.dictView === 'list',
    setDictCards: () => setState({ dictView: 'cards' }), setDictListView: () => setState({ dictView: 'list' }),
    dictCardsBg: S.dictView === 'cards' ? 'var(--me-blue)' : '#fff', dictCardsFg: S.dictView === 'cards' ? '#fff' : 'var(--me-grey-70)',
    dictListBg: S.dictView === 'list' ? 'var(--me-blue)' : '#fff', dictListFg: S.dictView === 'list' ? '#fff' : 'var(--me-grey-70)',
    dictSearch: S.dictSearch, setDictSearch: (e) => setState({ dictSearch: e.target.value }),
    fieldRows, docRows, isDictDetail: !!dictDetail, dictDetail,
    addField: () => setDF((fs) => [...fs, { id: 'f' + reqId(), code: '', name: 'New field', description: '', docs: [] }]),
    addDoc: () => setDD((ds) => [...ds, { id: 'd' + reqId(), key: '', name: 'New document type', description: '' }]),

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
    newCheck: () => setState((s) => { const id = 'GEN-' + String(s.newSeq + 90).padStart(2, '0'); const nc = { id, domain: 'Uncategorised', cases: 0, draft: true, agentId: null, groupId: null, title: 'New check', severity: 'MAJOR', refs: [], suggestion: 'Add a condition or two so the assistant has something to check.', body: 'Describe what the agent should check, in plain language.\n\nFields to look at: {  }\n\n- ', timeline: [{ color: 'var(--me-blue)', label: 'Created', date: 'just now', detail: 'New check.' }] }; return { extraChecks: [nc, ...s.extraChecks], newSeq: s.newSeq + 1, editingId: id, section: 'checks' } }),

    // Agents list
    newAgent: () => setState((s) => { const id = 'agent' + reqId(); const a = { id, name: 'New agent', cat: 'Uncategorised', status: 'Draft', statusTone: 'neutral', cov: '', covColor: 'var(--me-grey-70)', summary: 'What this agent reads.', eyebrow: '', description: '', domainId: '', owner: '', version: '', icon: 'bot', accent: '#525355', behavior: '', config: { tools: [] } }; return { extraAgents: [...s.extraAgents, a], section: 'agents', view: 'detail', activeAgentId: id, detailTab: 'checkpoints', panel: null } }),
    agents: allAgents().filter((a) => !S.deletedAgentIds[a.id]).map((raw) => withEdits(raw)).map((a) => ({
      ...a,
      accentSoft: a.accent ? a.accent + '1A' : 'var(--me-grey-08)',
      cps: allChecks().filter((c) => placementOf(c).agentId === a.id).length,
      groups: S.agentGroups.filter((g) => g.agentId === a.id).length,
      onOpen: () => setState({ section: 'agents', view: 'detail', activeAgentId: a.id, detailTab: 'checkpoints', panel: null }),
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
    confirm: S.confirm ? { title: S.confirm.title, message: S.confirm.message, confirmLabel: S.confirm.confirmLabel, blocked: S.confirm.blocked, acknowledgeLabel: S.confirm.acknowledgeLabel, onCancel: () => setState({ confirm: null }), onConfirm: () => { const fn = S.confirm.onConfirm; setState({ confirm: null }); if (fn) fn() } } : null,
    addOpen: S.addOpen, openAdd: () => setState({ addOpen: true }), closeAdd: () => setState({ addOpen: false }), stop: (e) => { if (e && e.stopPropagation) e.stopPropagation() },
    agentActive: S.agentActive, toggleAgent: (v) => setState({ agentActive: v }),
    openTest: () => setState({ testOpen: true }), closeTest: () => setState({ testOpen: false }), testOpen: S.testOpen, phases,

    isCheckpointsTab: tab === 'checkpoints', isConfigTab: tab === 'config',
    tabCheckpoints: () => setState({ detailTab: 'checkpoints', panel: null }), tabConfig: () => setState({ detailTab: 'config', panel: null }),
    cpTabColor: tab === 'checkpoints' ? 'var(--me-blue)' : 'var(--me-grey-70)', cpTabWeight: tab === 'checkpoints' ? 700 : 500, cpTabBorder: tab === 'checkpoints' ? 'var(--me-blue)' : 'transparent',
    cfgTabColor: tab === 'config' ? 'var(--me-blue)' : 'var(--me-grey-70)', cfgTabWeight: tab === 'config' ? 700 : 500, cfgTabBorder: tab === 'config' ? 'var(--me-blue)' : 'transparent',

    groups, addGroup: () => addGroupFor(detailAgentId), panelOpen: false,
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
