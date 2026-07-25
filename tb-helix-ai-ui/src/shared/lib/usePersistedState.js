import { useState, useEffect } from 'react'

// State that survives a reload, for display preferences the user set deliberately.
//
// Only for preferences — never for case data or anything an officer decided.
// Those belong to the service; putting them in a browser store would make the
// record depend on which machine someone sat at.
//
// localStorage rather than a cookie: this never needs to reach the server, and a
// cookie would be sent on every request for no reason.
export function usePersistedState(key, fallback) {
  const storageKey = `helix.${key}`

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return fallback
    try {
      const raw = window.localStorage.getItem(storageKey)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      // Private mode, quota, or a value written by an older build.
      return fallback
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Storage unavailable — the preference simply will not persist.
    }
  }, [storageKey, value])

  return [value, setValue]
}
