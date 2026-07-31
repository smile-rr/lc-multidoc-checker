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

export const usd = (n) => `$${(n ?? 0).toFixed(2)}`

/**
 * Money that may be a fraction of a cent.
 *
 * Two decimals is right for a bill and wrong for a model call: at flash rates a
 * real call is $0.00035, which `usd` renders as `$0.00` — a number that reads as
 * *free* rather than *small*, and quietly removes the reason to look. Anything
 * under a cent gets the digits that make it a number.
 */
export const usdFine = (n) => {
  const v = Number(n) || 0
  if (v === 0) return '$0'
  return v < 0.01 ? `$${v.toFixed(5)}` : `$${v.toFixed(2)}`
}

/**
 * Seconds, down to the millisecond when that is all there is.
 *
 * `0 s` beside a step that plainly did something reads as a broken meter. A run
 * answered from cache genuinely takes milliseconds, and saying so is the point.
 */
export const seconds2 = (s) => {
  const v = Math.max(0, Number(s) || 0)
  if (v === 0) return '0 s'
  if (v < 1) return `${Math.round(v * 1000)} ms`
  if (v < 90) return `${v.toFixed(1)} s`
  return `${(v / 60).toFixed(1)} min`
}

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
