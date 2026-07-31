import { MODELS, RUN_STEPS } from '../data/fixtures.js'

// What a run cost, derived from raw usage.
//
// Priced per model, because a run is not one model: a vision model reads the
// pages, a cheap text model plans, the main model reads the judged rules, and their
// prices differ by more than an order of magnitude. A single blended figure hides
// the only thing worth knowing — which model the money went to.
//
// The service will eventually report these totals itself. Until then the
// arithmetic lives here rather than in a component, so the header pill, the
// summary and the matrix cannot drift apart.

const OBSERVED_PARALLELISM = 1.84

const rateFor = (modelId) => MODELS[modelId] ?? { inPerMillion: 0, outPerMillion: 0, label: modelId, role: '', host: '' }

const stepCost = (step) => {
  const r = rateFor(step.model)
  return (step.tokensIn * r.inPerMillion + step.tokensOut * r.outPerMillion) / 1e6
}

const zero = () => ({ seconds: 0, tokensIn: 0, tokensOut: 0, cost: 0, retries: 0, calls: 0, checks: 0 })

const add = (acc, s) => ({
  seconds: acc.seconds + s.seconds,
  tokensIn: acc.tokensIn + s.tokensIn,
  tokensOut: acc.tokensOut + s.tokensOut,
  cost: acc.cost + stepCost(s),
  retries: acc.retries + s.retries,
  calls: acc.calls + (s.calls ?? 1),
  checks: acc.checks + (s.checks ?? 0),
})

/**
 * The four things a run spends time on, in the order it spends it.
 *
 * This is the split that decides anything. Reading and planning are fixed costs of
 * accepting the file; then the examination itself divides by **tier**, and the two
 * halves could not be less alike — exact rules are free and instant, judged rules are
 * the entire bill. An officer weighing whether to let the judged half run after an
 * exact rule has already failed is asking exactly this question, and a single blended
 * total cannot answer it.
 */
export const RUN_KINDS = [
  { key: 'read', label: 'Reading the pages', note: 'A vision model renders and reads every page once. Cached across cases.' },
  { key: 'plan', label: 'Planning the checks', note: 'Which rules this credit brings into play, and which of its requirements no rule covers.' },
  { key: 'exact', label: 'Exact rules', note: 'Field against field. No model, no tokens, same answer every time.' },
  { key: 'judged', label: 'Judged rules', note: 'An agent reads the documents and forms a view. This is where the money goes.' },
]

const weightedCache = (steps) => {
  const tin = steps.reduce((a, s) => a + s.tokensIn, 0)
  return tin ? steps.reduce((a, s) => a + s.tokensIn * s.cachePct, 0) / tin : 0
}

/**
 * What one judged rule costs, before it runs.
 *
 * The plan screen has to price the judged half *before* anything runs, so that an
 * officer choosing to stop on an exact-rule failure can see what stopping saves. It used
 * to multiply by a hand-written 4.9k, which was three times under what this table
 * actually reports — so the plan promised a saving a third of the real one, and the
 * drawer afterwards contradicted it.
 *
 * Derived from the same steps the drawer prices, so the estimate and the invoice
 * cannot disagree.
 */
export function judgedRuleCost(cardCount, steps = RUN_STEPS) {
  const reqs = steps.filter((s) => s.kind === 'judged')
  const cards = reqs.reduce((a, s) => a + (s.checks ?? 0), 0)
  if (!cards) return { tokens: 0, cost: 0, seconds: 0 }
  const tokens = reqs.reduce((a, s) => a + s.tokensIn + s.tokensOut, 0)
  const cost = reqs.reduce((a, s) => a + stepCost(s), 0)
  const seconds = reqs.reduce((a, s) => a + s.seconds, 0)
  return {
    tokens: (tokens / cards) * cardCount,
    cost: (cost / cards) * cardCount,
    seconds: (seconds / cards) * cardCount,
  }
}

/**
 * @param {import('../data/contracts.js').RunStep[]} steps
 * @param {number} completedCount How many steps have returned.
 * @param {number} pageCount
 */
export function summariseRun(steps, completedCount, pageCount) {
  const done = steps.slice(0, completedCount)
  const totals = done.reduce(add, zero())

  const tokens = totals.tokensIn + totals.tokensOut
  const wallClock = totals.seconds / OBSERVED_PARALLELISM

  // Per-model rollup, most expensive first — that is the order anyone asking
  // "why did this cost that" wants to read it in.
  const byModelMap = new Map()
  done.forEach((s) => {
    const cur = byModelMap.get(s.model) ?? { ...zero(), steps: [] }
    const next = add(cur, s)
    next.steps = [...cur.steps, s]
    byModelMap.set(s.model, next)
  })

  const byModel = [...byModelMap.entries()]
    .map(([modelId, agg]) => {
      const meta = rateFor(modelId)
      return {
        modelId,
        label: meta.label,
        role: meta.role,
        host: meta.host,
        inPerMillion: meta.inPerMillion,
        outPerMillion: meta.outPerMillion,
        ...agg,
        tokens: agg.tokensIn + agg.tokensOut,
        cacheHitPct: weightedCache(agg.steps),
        costShare: totals.cost ? agg.cost / totals.cost : 0,
      }
    })
    .sort((a, b) => b.cost - a.cost)

  // Per-kind rollup, in run order rather than by size — this one is read as a
  // sequence ("what did each part of the examination cost"), not as a ranking.
  const byKind = RUN_KINDS
    .map((k) => {
      const steps = done.filter((s) => s.kind === k.key)
      if (!steps.length) return null
      const agg = steps.reduce(add, zero())
      return {
        ...k,
        ...agg,
        tokens: agg.tokensIn + agg.tokensOut,
        costShare: totals.cost ? agg.cost / totals.cost : 0,
        free: agg.cost === 0,
      }
    })
    .filter(Boolean)

  const examining = byKind.filter((k) => k.key === 'exact' || k.key === 'judged')

  return {
    ...totals,
    tokens,
    wallClock,
    byKind,
    // How much of the examination was settled without asking a model anything. The
    // one number that says what the exact/judged split is worth.
    cardsSettled: examining.reduce((a, k) => a + k.checks, 0),
    cardsFree: examining.filter((k) => k.free).reduce((a, k) => a + k.checks, 0),
    cacheHitPct: weightedCache(done),
    pagesRead: Math.min(pageCount, completedCount * 2),
    costPerPage: pageCount ? totals.cost / pageCount : 0,
    modelCount: byModel.length,
    byModel,
    rows: steps.map((s, i) => ({
      ...s,
      state: i < completedCount ? 'done' : i === completedCount ? 'running' : 'queued',
      cost: stepCost(s),
      modelLabel: rateFor(s.model).label,
    })),
  }
}

/**
 * What a case cost, from the service's own ledger.
 *
 * The counterpart to `summariseRun`, which estimates from a step table and a
 * rate card held in this file. That was right while the fixtures were the only
 * source; it is wrong now that `helix_infra.model_call` records every attempt and
 * prices it against a book somebody maintains. Two rate cards would drift, and
 * the one on screen would be the one nobody could correct.
 *
 * So this does no pricing. It sums what the service already priced, and where
 * the ledger cannot answer — how many checks a step settled — it says nothing
 * rather than guessing.
 *
 * @param {object[]} spend rows from GET /cases/{id}/spend
 * @param {number} pageCount pages in the presentation, for the per-page figure
 */
export function summariseLedger(spend = [], pageCount = 0) {
  const rows = spend.map((r, i) => ({
    id: `${r.stage}/${r.step}`,
    name: `${r.stage} · ${r.step}`,
    kind: (r.kind || '').toLowerCase() === 'vision' ? 'read' : 'judged',
    role: `${r.role || ''}${r.family ? ` · ${r.family}` : ''}`,
    model: r.modelId,
    modelLabel: r.family || r.modelId,
    checks: 0,
    calls: r.calls || 0,
    seconds: (r.ms || 0) / 1000,
    tokensIn: r.tokensIn || 0,
    tokensOut: r.tokensOut || 0,
    // Share of this step's calls that never reached a provider.
    cachePct: r.calls ? Math.round((r.cached / r.calls) * 100) : 0,
    retries: r.failed || 0,
    cost: Number(r.cost) || 0,
    state: 'done',
  }))

  const sum = (f) => rows.reduce((a, r) => a + f(r), 0)
  const calls = sum((r) => r.calls)
  const cached = spend.reduce((a, r) => a + (r.cached || 0), 0)
  const seconds = sum((r) => r.seconds)
  const cost = sum((r) => r.cost)

  return {
    seconds,
    // No parallelism factor invented here: the ledger records each call's own
    // latency, and slots that ran at the same time already overlap in it.
    wallClock: seconds,
    cost,
    calls,
    checks: 0,
    tokensIn: sum((r) => r.tokensIn),
    tokensOut: sum((r) => r.tokensOut),
    tokens: sum((r) => r.tokensIn + r.tokensOut),
    retries: sum((r) => r.retries),
    byKind: [],
    cardsSettled: 0,
    cardsFree: 0,
    cacheHitPct: calls ? Math.round((cached / calls) * 100) : 0,
    pagesRead: pageCount,
    costPerPage: pageCount ? cost / pageCount : 0,
    modelCount: new Set(rows.map((r) => r.model)).size,
    byModel: [],
    rows,
  }
}

/**
 * Portfolio spend across many cases.
 *
 * The per-case drawer answers "what did this one cost". This answers the
 * question an operations lead actually has: what is this costing us, is it
 * stable per case, where is it going, and is it worth it. Those are different
 * questions and they need different denominators — per case and per page, not a
 * single total, because a total only ever goes up.
 *
 * Derived from the same step and model tables as the per-case figure, scaled by
 * each case's page count, so the two can never disagree.
 *
 * @param {{ id: string, pageCount: number, examined: boolean }[]} cases
 * @param {import('../data/contracts.js').RunStep[]} steps
 * @param {number} baselinePages Pages the step table was measured against.
 */
export function summariseSpend(cases, steps, baselinePages = 6) {
  const examined = cases.filter((c) => c.examined)
  const base = summariseRun(steps, steps.length, baselinePages)

  // Cost scales with pages read, which is what actually drives token count.
  const scaled = examined.map((c) => {
    const factor = c.pageCount / baselinePages
    return {
      id: c.id,
      pages: c.pageCount,
      cost: base.cost * factor,
      seconds: base.wallClock * factor,
      tokens: base.tokens * factor,
    }
  })

  // What caching kept off the bill. Cached input is billed at roughly a tenth of
  // full rate, so the avoided share is the cached fraction less that. Derived
  // from the same usage as the spend — an "avoided" number nobody can reconcile
  // is worth nothing.
  const CACHE_DISCOUNT = 0.9
  const avoidedPerBaseline = steps.reduce((acc, st) => {
    const r = rateFor(st.model)
    return acc + (st.tokensIn * (st.cachePct / 100) * CACHE_DISCOUNT * r.inPerMillion) / 1e6
  }, 0)

  const totalCost = scaled.reduce((a, c) => a + c.cost, 0)
  const totalPages = scaled.reduce((a, c) => a + c.pages, 0)
  const totalTokens = scaled.reduce((a, c) => a + c.tokens, 0)
  const times = scaled.map((c) => c.seconds).sort((a, b) => a - b)
  const median = times.length ? times[Math.floor(times.length / 2)] : 0

  const pageFactor = examined.reduce((a, c) => a + c.pageCount / baselinePages, 0)

  return {
    casesExamined: examined.length,
    // What the deterministic half does for the bill, per case. Not scaled by pages:
    // an exact rule costs nothing on a six-page bundle and nothing on a sixty-page one.
    cardsPerCase: base.cardsSettled,
    freeCardsPerCase: base.cardsFree,
    freeCardPct: base.cardsSettled ? (base.cardsFree / base.cardsSettled) * 100 : 0,
    costAvoided: avoidedPerBaseline * pageFactor,
    cachedInputPct: base.cacheHitPct,
    casesTotal: cases.length,
    totalPages,
    totalTokens,
    totalCost,
    avgCostPerCase: examined.length ? totalCost / examined.length : 0,
    avgCostPerPage: totalPages ? totalCost / totalPages : 0,
    medianWallClock: median,
    // Spread rather than pick: dropping the rate and host fields here left them
    // undefined for any caller that later wanted to show them, which is a silent
    // bug waiting to be written. Only the cost is rescaled to the period.
    byModel: base.byModel.map((m) => ({
      ...m,
      cost: m.cost * (totalCost / (base.cost || 1)),
    })),
  }
}

export { MODELS }
