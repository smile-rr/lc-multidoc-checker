// Presentation-layer formatting. Data stays in raw units; every string a user
// reads is built here, so a locale or currency-style change is one edit.

export const money = (currency, amount) =>
  `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const seconds = (s) => `${s.toFixed(1)}s`

export const thousands = (n, digits = 0) => `${(n / 1000).toFixed(digits)}K`

export const usd = (n) => `$${n.toFixed(2)}`

export const percent = (n) => `${Math.round(n)}%`

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** '3 days', 'today', or null when nothing is outstanding. */
export const dueLabel = (days) => (days == null ? null : days === 0 ? 'today' : plural(days, 'day'))

/** Inclusive page range as the officer reads it: 'p.4' or 'p.2–3'. */
export const pageRange = (range) => {
  if (!range) return ''
  const [from, to] = range
  return from === to ? `p.${from}` : `p.${from}–${to}`
}
