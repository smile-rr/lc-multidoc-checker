import { MODELS } from '../data/fixtures.js'

// What a run cost, derived from raw usage.
//
// Priced per model, because a run is not one model: a vision model reads the
// pages, a cheap text model plans, the main model executes the rules, and their
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

const zero = () => ({ seconds: 0, tokensIn: 0, tokensOut: 0, cost: 0, retries: 0, calls: 0 })

const add = (acc, s) => ({
  seconds: acc.seconds + s.seconds,
  tokensIn: acc.tokensIn + s.tokensIn,
  tokensOut: acc.tokensOut + s.tokensOut,
  cost: acc.cost + stepCost(s),
  retries: acc.retries + s.retries,
  calls: acc.calls + (s.calls ?? 1),
})

const weightedCache = (steps) => {
  const tin = steps.reduce((a, s) => a + s.tokensIn, 0)
  return tin ? steps.reduce((a, s) => a + s.tokensIn * s.cachePct, 0) / tin : 0
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

  return {
    ...totals,
    tokens,
    wallClock,
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
    costAvoided: avoidedPerBaseline * pageFactor,
    cachedInputPct: base.cacheHitPct,
    casesTotal: cases.length,
    totalPages,
    totalTokens,
    totalCost,
    avgCostPerCase: examined.length ? totalCost / examined.length : 0,
    avgCostPerPage: totalPages ? totalCost / totalPages : 0,
    medianWallClock: median,
    byModel: base.byModel.map((m) => ({
      modelId: m.modelId,
      label: m.label,
      role: m.role,
      costShare: m.costShare,
      cost: m.cost * (totalCost / (base.cost || 1)),
    })),
  }
}

export { MODELS }
