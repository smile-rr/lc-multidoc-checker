// ===========================================================================
// Where the app's data comes from.
//
// Two sources, chosen at build time by VITE_DATA_SOURCE:
//
//   mock   the fixtures in each module's data/ — the default
//   api    tb-helix-ai-svc on :9090, proxied at /api in dev
//
// **Mock is the default and stays the default** until the backend covers every
// screen. That is not caution about the backend; it is that the fixtures are the
// design. They encode what a finding looks like, what a plan reads like, which
// cases are interesting — and every one of those was argued over. A UI that can
// only run against a live service loses the ability to demo, to review a layout,
// and to reproduce the exact case a discussion is about.
//
// Both adapters return the same shapes, and `contracts.js` is the referee. When
// the two disagree the contract is right and one of them is wrong.
// ===========================================================================

const MODES = ['mock', 'api']

const configured = (import.meta.env?.VITE_DATA_SOURCE ?? 'mock').toLowerCase()

/** 'mock' | 'api'. Anything unrecognised falls back to mock rather than failing. */
export const DATA_SOURCE = MODES.includes(configured) ? configured : 'mock'

export const isMock = DATA_SOURCE === 'mock'
export const isApi = DATA_SOURCE === 'api'

/** Base path for the service. Dev proxies /api to :9090; production serves it same-origin. */
export const API_BASE = import.meta.env?.VITE_API_BASE ?? '/api/v1'

// Loud on purpose. "Why is my new backend change not showing up" has exactly one
// answer nine times out of ten, and it should not take twenty minutes to find.
if (typeof console !== 'undefined') {
  console.info(
    `[helix] data source: ${DATA_SOURCE}${isApi ? ` → ${API_BASE}` : ' (fixtures)'}`,
  )
}

/**
 * Picks between two implementations of the same seam.
 *
 * Used by each module's api module so the choice is made once per module rather
 * than at every call site, and so a partially-migrated module can mix: pass a
 * mock function for an endpoint the service does not serve yet and the screen
 * keeps working.
 */
export function pick(mockImpl, apiImpl) {
  return isApi && apiImpl ? apiImpl : mockImpl
}
