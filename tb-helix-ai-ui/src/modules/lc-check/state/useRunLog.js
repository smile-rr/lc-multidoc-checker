// A case's events, from the beginning and as they arrive.
//
// Two sources, one list. The history endpoint has everything up to now; the
// stream has everything from now on, and replays anything the fetch missed in
// between. Merging on `seq` makes the overlap harmless, which is what lets the
// panel be opened at any moment — before a run, during one, or a week later —
// without three code paths.
//
// Only subscribes while the panel is open. A progress stream held open by a
// panel nobody is looking at is a connection per tab per case, and the whole
// point of the seq merge is that closing and reopening costs nothing.

import { useEffect, useRef, useState } from 'react'
import * as api from '../api/lcCheckApi'

const bySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0)

export default function useRunLog(caseId, active) {
  const [events, setEvents] = useState([])
  const [state, setState] = useState('idle')   // idle | loading | ready | failed
  const seen = useRef(new Set())

  // Merges, ignoring anything already held. The stream replays on reconnect, so
  // duplicates are the normal case rather than the exceptional one.
  const absorb = (incoming) => {
    const fresh = incoming.filter((e) => e && e.seq != null && !seen.current.has(e.seq))
    if (!fresh.length) return
    fresh.forEach((e) => seen.current.add(e.seq))
    setEvents((prev) => [...prev, ...fresh].sort(bySeq))
  }

  useEffect(() => {
    if (!caseId) return
    seen.current = new Set()
    setEvents([])
    setState('idle')
  }, [caseId])

  useEffect(() => {
    if (!active || !caseId) return
    let live = true

    setState((s) => (s === 'ready' ? s : 'loading'))
    api.getEvents(caseId)
      .then((rows) => { if (live) { absorb(rows ?? []); setState('ready') } })
      .catch(() => { if (live) setState('failed') })

    // The stream carries the same rows. An event that arrives before the fetch
    // returns is kept, not raced away — `seen` is the only arbiter of what is new.
    const stop = api.watchCase(caseId, (event) => { if (live) absorb([event]) })

    return () => { live = false; stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, active])

  return { events, state }
}
