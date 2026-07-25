// One severity/tone vocabulary for the whole platform.
//
// Both modules grade things on the same axis — a governance check has a
// severity, an LC finding has a disposition — and both must colour it
// identically or the UI stops being readable across modules. The `tone` key maps
// onto Badge's tones; `dot`/`accent`/`text`/`wash` are for bespoke chrome.

export const TONE = {
  success: { tone: 'green', dot: 'var(--status-success)', accent: 'var(--status-success)', text: '#1a7a32', wash: '#DDF3E1', border: 'var(--me-grey-15)' },
  error: { tone: 'error', dot: 'var(--status-error)', accent: 'var(--status-error)', text: 'var(--status-error)', wash: '#FADEDD', border: '#F3C9C7' },
  warning: { tone: 'warning', dot: 'var(--status-warning)', accent: 'var(--status-warning)', text: '#946400', wash: '#FBEFCF', border: '#F0DFB6' },
  info: { tone: 'blue', dot: 'var(--me-blue)', accent: 'var(--me-blue)', text: 'var(--me-blue-deep)', wash: 'var(--me-blue-20)', border: 'var(--me-blue-20)' },
  neutral: { tone: 'neutral', dot: 'var(--me-grey-50)', accent: 'var(--me-grey-50)', text: 'var(--me-grey-70)', wash: 'var(--me-grey-15)', border: 'var(--me-grey-15)' },
}

export const toneOf = (key) => TONE[key] || TONE.neutral

// The highlight used to link a value back to the source line it was read from.
export const PROVENANCE_HIGHLIGHT = { bg: '#FBEFCF', ring: '0 0 0 1px #E8C87A' }
