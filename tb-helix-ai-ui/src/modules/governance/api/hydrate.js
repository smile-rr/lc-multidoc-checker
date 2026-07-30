// ===========================================================================
// Filling the seed from the service.
//
// `store.js` binds parts of seed.json into module constants at import — AGENTS,
// CHECKS, GROUPS, REF_BOOK — and builds `initialState` from them. That is not a
// mistake to unpick: those constants are read from a hundred places, and turning
// them into state would mean threading a loading flag through every one.
//
// So this fills the seed **in place** instead. Arrays are emptied and refilled,
// objects have their keys replaced, and every existing reference stays valid.
// Run it before the module first renders and the store cannot tell the
// difference between the fixture and the service.
//
// The mapping is the interesting part. The service normalises what the fixture
// keeps convenient:
//
//   binding.doc     a document NAME in the fixture, a doc_code in the service
//   check.cases     a usage count the service calls cases_count
//   check_rule      one groups[] tree; the fixture kept a flat {logic, rows}
//   comments        a flat table here, keyed by target in the fixture
//
// Where the service knows something the fixture never did — gate eligibility,
// derived from the dictionary — it is carried across, because that is the whole
// reason the authoring surface asks a server rather than guessing.
// ===========================================================================

/** Replaces an array's contents, keeping the reference every importer holds. */
function refill(target, items) {
  if (!Array.isArray(target)) return
  target.length = 0
  items.forEach((i) => target.push(i))
}

/** Replaces an object's keys, keeping the reference. */
function rekey(target, source) {
  if (!target || typeof target !== 'object') return
  Object.keys(target).forEach((k) => delete target[k])
  Object.assign(target, source)
}

export function hydrateSeed(seed, data) {
  // Document codes first — bindings and checks both cite documents by code, and
  // the editor works in names.
  const nameOf = {}
  ;(data.docTypes ?? []).forEach((d) => { nameOf[d.code] = d.name })

  refill(seed.docTypes, (data.docTypes ?? []).map((d, i) => ({
    id: `d${i}`,
    key: d.code,
    name: d.name,
    description: d.description ?? '',
    ...(d.before_reading ? { beforeReading: true } : {}),
  })))

  const bindingsFor = {}
  ;(data.bindings ?? []).forEach((b) => {
    ;(bindingsFor[b.field_key] ??= []).push({ doc: nameOf[b.doc_code] ?? b.doc_code, note: b.note ?? '' })
  })
  refill(seed.fields, (data.fields ?? []).map((f, i) => ({
    id: `f${i + 1}`,
    key: f.key,
    name: f.name,
    description: f.description ?? '',
    bindings: bindingsFor[f.key] ?? [],
  })))

  // --- Checks ------------------------------------------------------------
  refill(seed.checks, (data.checks ?? []).map((c) => ({
    id: c.id,
    domain: c.domain ?? '',
    cases: c.cases_count ?? 0,
    agentId: c.agent_id ?? null,
    groupId: c.group_id ?? null,
    severity: c.severity,
    refs: c.refs ?? [],
    suggestion: '',
    title: c.title,
    body: c.body ?? '',
    timeline: [],
    checkType: c.check_type,
    ...(c.gate_on ? { gate: true } : {}),
    ...(c.status === 'DRAFT' ? { draft: true } : {}),
    // Derived server-side from the dictionary, so the toggle can be disabled
    // with the real reason rather than a guess made in the browser.
    gateEligible: c.gate_eligible ?? false,
  })))

  rekey(seed.checkDefaults, Object.fromEntries((data.checks ?? []).map((c) => [c.id, {
    fields: c.field_refs ?? [],
    docs: (c.doc_types ?? []).map((code) => nameOf[code] ?? code),
  }])))

  // The service keeps one groups[] tree; the fixture kept a flat rule and let
  // the store normalise it. Unwrap the first group so both shapes agree.
  rekey(seed.ruleSeeds, Object.fromEntries((data.rules ?? []).map((r) => {
    const groups = parse(r.groups) ?? []
    const first = groups[0] ?? {}
    return [r.check_id, {
      scope: r.scope ?? '',
      logic: first.logic ?? 'all',
      message: r.message ?? '',
      rows: first.rows ?? [],
      groups,
    }]
  })))

  // --- Agents ------------------------------------------------------------
  refill(seed.agents, (data.agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    cat: a.category ?? '',
    status: a.status === 'ACTIVE' ? 'Active' : 'Draft',
    statusTone: a.status === 'ACTIVE' ? 'success' : 'neutral',
    cov: '', covColor: '',
    summary: a.summary ?? '',
    eyebrow: a.eyebrow ?? '',
    description: a.description ?? '',
    domainId: a.domain_id ?? '',
    owner: a.owner ?? '',
    version: a.version ?? '',
    icon: a.icon ?? 'bot',
    accent: a.accent ?? '#3b6ea5',
    behavior: a.behavior ?? '',
    config: parse(a.config) ?? {},
  })))

  refill(seed.groups, (data.groups ?? []).map((g) => ({
    agentId: g.agent_id, gid: g.id, name: g.name, desc: g.description ?? '',
  })))

  // --- Library -----------------------------------------------------------
  refill(seed.refBook, (data.articles ?? []).map((a) => ({
    code: a.code, desc: a.heading ?? a.code,
  })))
  rekey(seed.articleInfo, Object.fromEntries((data.articles ?? []).map((a) => [a.code, {
    summary: a.summary ?? '', read: a.body ?? '',
  }])))

  // --- Comments ----------------------------------------------------------
  const byTarget = {}
  ;(data.comments ?? []).forEach((c) => {
    ;(byTarget[c.target_id] ??= []).push({
      initials: c.initials ?? initialsOf(c.author),
      author: c.author,
      when: c.created_at ?? '',
      avatarBg: '#dfe7f0',
      text: c.body,
      ...(c.tag ? { tag: c.tag } : {}),
    })
  })
  rekey(seed.comments, byTarget)

  return seed
}

function parse(value) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function initialsOf(name) {
  return String(name ?? '?')
    .split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
}
