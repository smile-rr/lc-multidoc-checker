// ===========================================================================
// What a condition may compare with.
//
// The service owns this vocabulary — it is an enum in `governance.types`, and the
// catalogue bootstrap serves it under `conditions.operators`. This module is where
// the browser keeps what it was given, and it exists so that there is exactly ONE
// place in the front end that knows an operator has a label, an arity, or a
// qualifier that means something.
//
// There used to be three lists in two languages: the enum, a hand-written map of
// wire names to sentences inside the planner's prompt builder, and a grouped list
// of labels in the governance store. Twenty operators, three copies, kept in step
// by somebody remembering. The one that gets forgotten is the one that leaves the
// console offering a comparison nothing implements — and it looks like a working
// rule right up until it runs.
//
// FALLBACK is not a fourth copy. It is what mock mode renders from, where there is
// no service to ask, and it is deliberately the same shape the service sends so the
// two cannot diverge in structure even while they diverge in content. Against a
// real service `adopt()` replaces it wholesale on first paint.
// ===========================================================================

/** The served shape: one object per operator, exactly as `conditions.operators` sends it. */
const FALLBACK = [
  { wire: 'eq', label: 'equals', group: 'TEXT', groupLabel: 'Text & wording', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'ne', label: 'differs from', group: 'TEXT', groupLabel: 'Text & wording', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'contains', label: 'contains', group: 'TEXT', groupLabel: 'Text & wording', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'oneof', label: 'is one of', group: 'TEXT', groupLabel: 'Text & wording', arity: 2, usesTol: false, judgement: false, literalRight: false },

  { wire: 'n_eq', label: 'equals (amount)', group: 'AMOUNT', groupLabel: 'Amounts & quantities', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'lte', label: 'is at most', group: 'AMOUNT', groupLabel: 'Amounts & quantities', arity: 2, usesTol: true, judgement: false, literalRight: false },
  { wire: 'gte', label: 'is at least', group: 'AMOUNT', groupLabel: 'Amounts & quantities', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'within_pct', label: 'is within tolerance of', group: 'AMOUNT', groupLabel: 'Amounts & quantities', arity: 2, usesTol: true, judgement: false, literalRight: false },

  { wire: 'd_lte', label: 'is on or before', group: 'DATE', groupLabel: 'Dates', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'd_gte', label: 'is on or after', group: 'DATE', groupLabel: 'Dates', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'd_eq', label: 'is the same date as', group: 'DATE', groupLabel: 'Dates', arity: 2, usesTol: false, judgement: false, literalRight: false },
  { wire: 'd_within', label: 'is within', group: 'DATE', groupLabel: 'Dates', arity: 2, usesTol: true, judgement: false, literalRight: false },

  { wire: 'present', label: 'is stated', group: 'PRESENCE', groupLabel: 'Presence & expression', arity: 1, usesTol: false, judgement: false, literalRight: false },
  { wire: 'absent', label: 'is not stated', group: 'PRESENCE', groupLabel: 'Presence & expression', arity: 1, usesTol: false, judgement: false, literalRight: false },
  { wire: 'matches', label: 'satisfies expression', group: 'PRESENCE', groupLabel: 'Presence & expression', arity: 2, usesTol: false, judgement: false, literalRight: true },
  { wire: 'nmatches', label: 'does not satisfy expression', group: 'PRESENCE', groupLabel: 'Presence & expression', arity: 2, usesTol: false, judgement: false, literalRight: true },

  { wire: 'noconflict', label: 'does not conflict with', group: 'PARTY', groupLabel: 'Parties, places & countries', arity: 2, usesTol: false, judgement: true, literalRight: false },
  { wire: 'same_party', label: 'is the same party as', group: 'PARTY', groupLabel: 'Parties, places & countries', arity: 2, usesTol: false, judgement: true, literalRight: false },
  { wire: 'same_country', label: 'is in the same country as', group: 'PARTY', groupLabel: 'Parties, places & countries', arity: 2, usesTol: false, judgement: true, literalRight: false },
  { wire: 'addr_same_country', label: 'address agrees (same country is enough)', group: 'PARTY', groupLabel: 'Parties, places & countries', arity: 2, usesTol: false, judgement: true, literalRight: false },
]

// Module-level rather than context, because it is loaded once at boot and read from
// a render path and a reducer alike. A vocabulary threaded through props would be
// threaded through every component that draws a row, for a value that never changes
// after first paint.
let served = null

/** Take what the service sent. Ignores anything empty, so a failed fetch keeps the fallback. */
export function adopt(conditions) {
  const ops = Array.isArray(conditions) ? conditions : conditions?.operators
  if (Array.isArray(ops) && ops.length) served = ops
  const fns = conditions?.functions
  if (Array.isArray(fns) && fns.length) servedFunctions = fns
}

export const operators = () => served ?? FALLBACK

const find = (wire) => operators().find((o) => o.wire === wire) ?? null

/** How an examiner reads it. Falls back to the wire name, which is ugly and true. */
export const operatorLabel = (wire) => find(wire)?.label ?? wire ?? ''

/** Whether it reads one operand. A unary row has no right-hand side to draw. */
export const operatorUnary = (wire) => (find(wire)?.arity ?? 2) === 1

/** Whether the right-hand side may only be a fixed value — a pattern, not a field. */
export const operatorLiteralRight = (wire) => !!find(wire)?.literalRight

/**
 * Whether the qualifier box is read by anything.
 *
 * Three operators read it; the other sixteen discard whatever is typed. The console
 * showed the input on all of them, so a rule comparing two goods descriptions with
 * `eq` and the qualifier "corresponds, not identical" reads like an instruction and
 * runs as a strict string equality.
 */
export const operatorUsesTol = (wire) => !!find(wire)?.usesTol

/** Whether it is a judgement wearing an operator's clothes, and so falls to an examiner. */
export const operatorJudgement = (wire) => !!find(wire)?.judgement

// ---------------------------------------------------------------------------
// Values a condition works out rather than reads.
//
// UCP 600 art. 14(c) — twenty-one days from the date of shipment — cannot be
// written as a comparison without one of these: there is no field called
// "twenty-one days after the on-board date". Eight functions, fixed arities, and
// nothing else; that is what keeps a compiled rule something the service can check
// before it runs rather than by running it.
// ---------------------------------------------------------------------------
const FALLBACK_FUNCTIONS = [
  { wire: 'date_plus', arity: 2, describe: 'a date, plus a number of calendar days' },
  { wire: 'date_minus', arity: 2, describe: 'a date, minus a number of calendar days' },
  { wire: 'days_between', arity: 2, describe: 'how many calendar days apart two dates are' },
  { wire: 'pct_of', arity: 2, describe: 'a percentage of an amount' },
  { wire: 'sum_of', arity: -1, describe: 'two or more amounts added together' },
  { wire: 'product_of', arity: 2, describe: 'two amounts multiplied — quantity times unit price' },
  { wire: 'num_of', arity: 1, describe: 'the number inside a value written with a currency or separators' },
  { wire: 'party_of', arity: 1, describe: 'a company name with punctuation, case and legal form removed' },
]

let servedFunctions = null

/** What a `doc` says when the demand is about every document that carries the field. */
export const ANY_DOCUMENT = '*'

export const functions = () => servedFunctions ?? FALLBACK_FUNCTIONS

export const functionOf = (wire) => functions().find((f) => f.wire === wire) ?? null

/** How a computed operand reads before anything is resolved. */
export function describeExpr(expr) {
  if (!expr || !expr.fn) return '?'
  const args = (expr.args ?? []).map(describeOperand).join(', ')
  return `${expr.fn}(${args})`
}

export function describeOperand(o) {
  if (!o) return '?'
  if (o.literal != null) return `“${o.literal}”`
  if (o.expr) return describeExpr(o.expr)
  if (!o.doc || !o.field) return '?'
  return `${o.doc === ANY_DOCUMENT ? 'every document' : o.doc}.${o.field}`
}

/** Grouped the way a checker thinks, for the authoring picker. Order follows the service. */
export function operatorGroups() {
  const out = []
  for (const o of operators()) {
    let g = out.find((x) => x.id === o.group)
    if (!g) {
      g = { id: o.group, label: o.groupLabel, ops: [] }
      out.push(g)
    }
    g.ops.push({ value: o.wire, label: o.label })
  }
  return out
}
