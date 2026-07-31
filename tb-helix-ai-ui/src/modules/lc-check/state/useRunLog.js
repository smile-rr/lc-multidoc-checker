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
//
// Spend (the ledger) is separate from the tape: events say what happened, the
// ledger says what it cost. The stream triggers a coalesced refetch on model
// events; when the cost drawer is open during a live run we also poll lightly,
// because the ledger can land a beat after the event and a 600 ms refetch alone
// would still show yesterday's total.

import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/lcCheckApi'

const bySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0)

/**
 * @param {string} caseId
 * @param {boolean} active           subscribe to the event stream
 * @param {{ spendFocus?: boolean, pollSpendMs?: number }} [opts]
 *   spendFocus — cost drawer is open: refetch ledger now
 *   pollSpendMs — while > 0, refetch ledger on this interval (live run safety net)
 */
export default function useRunLog(caseId, active, opts = {}) {
  const { spendFocus = false, pollSpendMs = 0 } = opts
  const [events, setEvents] = useState([])
  const [spend, setSpend] = useState([])
  const [state, setState] = useState('idle')   // idle | loading | ready | failed
  const seen = useRef(new Set())
  const liveRef = useRef(false)

  const pullSpend = useCallback(() => {
    if (!caseId) return Promise.resolve()
    return api.getSpend(caseId).then((rows) => {
      if (liveRef.current) setSpend(rows ?? [])
    }).catch(() => {})
  }, [caseId])

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
    setSpend([])
    setState('idle')
  }, [caseId])

  useEffect(() => {
    if (!active || !caseId) return undefined
    let live = true
    liveRef.current = true

    setState((s) => (s === 'ready' ? s : 'loading'))
    api.getEvents(caseId)
      .then((rows) => { if (live) { absorb(rows ?? []); setState('ready') } })
      .catch(() => { if (live) setState('failed') })

    // Best effort. A run log without costs is still a run log; a run log that
    // refused to render because the ledger was unreachable would not be.
    pullSpend()

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
      if (event.type === 'llm_call' || event.type === 'llm_cached' || event.type === 'stage_done') {
        clearTimeout(due)
        due = setTimeout(() => { if (live) pullSpend() }, 600)
      }
    })

    return () => {
      live = false
      liveRef.current = false
      clearTimeout(due)
      stop?.()
    }
  }, [caseId, active, pullSpend])

  // Cost drawer just opened — pull now so the first paint is not a stale total
  // from when the workbench mounted before any calls landed.
  useEffect(() => {
    if (!spendFocus || !caseId) return
    pullSpend()
  }, [spendFocus, caseId, pullSpend])

  // Live run + drawer open: poll as a safety net for ledger lag after events.
  useEffect(() => {
    if (!pollSpendMs || !caseId) return undefined
    const id = setInterval(() => { pullSpend() }, pollSpendMs)
    return () => clearInterval(id)
  }, [pollSpendMs, caseId, pullSpend])

  return { events, spend, state, refreshSpend: pullSpend }
}
