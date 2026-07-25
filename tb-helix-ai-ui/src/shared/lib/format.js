// Presentation-layer formatting. Data stays in raw units; every string a user
// reads is built here, so a locale or currency-style change is one edit.

export const money = (currency, amount) =>
  `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const seconds = (s) => `${s.toFixed(1)}s`

/**
 * A duration in the unit a reader would use for it.
 *
 *   42      → "42 s"
 *   195     → "3 min 15 s"
 *   4_500   → "1 h 15 min"
 *
 * Real examination runs take minutes, so a formatter fixed to seconds reports
 * "195.0s" and makes the reader do the division.
 */
export function duration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds ?? 0))
  if (s < 90) return `${s} s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const rem = s % 60
    return rem ? `${m} min ${rem} s` : `${m} min`
  }
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Compact form for a dense row: "3.2 min". */
export function durationShort(totalSeconds) {
  const s = Math.max(0, totalSeconds ?? 0)
  if (s < 90) return `${Math.round(s)} s`
  if (s < 3600) return `${(s / 60).toFixed(1)} min`
  return `${(s / 3600).toFixed(1)} h`
}

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
