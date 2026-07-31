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
// **There is almost no mapping left.** The service stores each thing as one JSON
// document in the shape the console already works in, so a document arrives ready
// to use. What remains is unpacking what the console holds flat and the service
// holds nested — an agent's groups, a book's articles — plus the few values the
// service derives and the fixture never had.
//
// The translation that used to be here was field-by-field over eight row shapes,
// and it was where a lookup deleted in one refactor took the entire console back
// onto its own fixture behind a banner nobody could explain.
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
  // --- Dictionary --------------------------------------------------------
  // `id` is the console's handle for the row it is editing. The key is the
  // identity, so it serves as both and there is nothing to invent.
  refill(seed.docTypes, (data.docTypes ?? []).map((d) => ({ id: d.key, ...d })))
  refill(seed.fields, (data.fields ?? []).map((f) => ({ id: f.key, bindings: [], ...f })))

  // --- Checks ------------------------------------------------------------
  refill(seed.checks, (data.checks ?? []).map((c) => ({
    ...c,
    // Derived by the service, because the dictionary is there: whether this could
    // run before the presentation is read, and whether it currently does.
    ...(c.gateOn ? { gate: true } : {}),
    ...(c.status === 'DRAFT' ? { draft: true } : {}),
    gateEligible: c.gateEligible ?? false,
  })))

  rekey(seed.checkDefaults, Object.fromEntries((data.checks ?? []).map((c) => [c.id, {
    fields: c.fields ?? [],
    docs: c.docs ?? [],
  }])))

  // A check carries its own rule now — one document, saved in one call, so a check
  // can no longer be stored without the conditions that make it mean anything. The
  // editor works one group at a time, so the first is flattened beside the tree.
  rekey(seed.ruleSeeds, Object.fromEntries(
    (data.checks ?? [])
      .filter((c) => c.rule)
      .map((c) => {
        const groups = c.rule.groups ?? []
        const first = groups[0] ?? {}
        return [c.id, {
          scope: c.rule.scope ?? '',
          message: c.rule.message ?? '',
          logic: first.logic ?? 'all',
          rows: first.rows ?? [],
          groups,
        }]
      }),
  ))

  // --- Agents ------------------------------------------------------------
  // An agent carries its groups; the console holds one flat list across all
  // agents, so they are unpacked here rather than stored that way.
  refill(seed.agents, (data.agents ?? []).map((a) => ({
    icon: 'bot',
    accent: '#3b6ea5',
    ...a,
    cov: '',
    covColor: '',
    status: 'Active',
    statusTone: 'success',
  })))

  refill(seed.groups, (data.agents ?? []).flatMap((a) =>
    (a.groups ?? []).map((g) => ({ agentId: a.id, gid: g.gid, name: g.name, desc: g.desc ?? '' })),
  ))

  // --- Library -----------------------------------------------------------
  const articles = (data.books ?? []).flatMap((b) =>
    (b.articles ?? []).map((a) => ({ ...a, bookId: b.id })))
  refill(seed.books, data.books ?? [])
  refill(seed.refBook, articles.map((a) => ({ code: a.code, desc: a.title ?? a.code })))
  rekey(seed.articleInfo, Object.fromEntries(
    articles.map((a) => [a.code, { summary: a.summary ?? '', read: a.read ?? '' }]),
  ))

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

  // A binding naming a document type that no longer exists. The database used to
  // refuse the delete; the console maintains the reference now, and this is how it
  // finds out where it did not.
  seed.dangling = data.dangling ?? []

  return seed
}

function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
}
