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
  // What each step spent. Fetched beside the tape rather than folded into it:
  // an event says what happened, a ledger row says what it cost, and the two are
  // written by different parts of the system at different moments.
  const [spend, setSpend] = useState([])
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

    // Best effort. A run log without costs is still a run log; a run log that
    // refused to render because the ledger was unreachable would not be.
    api.getSpend(caseId).then((rows) => { if (live) setSpend(rows ?? []) }).catch(() => {})

    // The stream carries the same rows. An event that arrives before the fetch
    // returns is kept, not raced away — `seen` is the only arbiter of what is new.
    //
    // A model event means the ledger has a new row, so the costs are refetched —
    // the tape is the trigger, the ledger stays the source. Putting the cost on the
    // event instead would freeze it against a rate that can change; this way the
    // number is always priced by the book as it stands now.
    //
    // Coalesced, because a fan-out lands six of these inside a second and six
    // refetches would answer the same question six times.
    let due = null
    const stop = api.watchCase(caseId, (event) => {
      if (!live) return
      absorb([event])
      if (event.type === 'llm_call' || event.type === 'llm_cached') {
        clearTimeout(due)
        due = setTimeout(() => {
          api.getSpend(caseId).then((rows) => { if (live) setSpend(rows ?? []) }).catch(() => {})
        }, 600)
      }
    })

    return () => { live = false; clearTimeout(due); stop?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, active])

  return { events, spend, state }
}
