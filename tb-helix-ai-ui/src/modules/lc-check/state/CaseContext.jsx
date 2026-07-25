import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api/lcCheckApi'
import { STAGES, needsAction } from './severity'

// ===========================================================================
// One case's working state.
//
// Split deliberately into three parts:
//   `data`     — what the service said (CaseDetail). Replaced, never patched.
//   `run`      — progress of the current review run.
//   `officer`  — what this person has done but not yet submitted.
//
// The split is what makes the officer-paced pipeline honest: nothing in
// `officer` is inferred from `data`, so the UI can never imply a decision the
// person didn't make.
// ===========================================================================

// Exported so a harness can mount a screen against a known case state without
// waiting on the async load. Application code should use `useCase`.
export const CaseContext = createContext(null)

const initial = {
  loading: true,
  error: null,
  data: null,

  run: {
    /** How many documents intake has carved out of the bundle so far. */
    segmented: 0,
    segmentTotal: 6,
    /** Areas fully returned, in completion order. */
    completedAreaIds: [],
    /** The area currently being read, if any. */
    activeAreaId: null,
    started: false,
    finished: false,
    mode: 'auto',
  },

  officer: {
    /** findingId -> Disposition */
    decisions: {},
    /** findingId -> note text (saved) */
    notes: {},
    /** findingId -> note text (in the box, unsaved) */
    drafts: {},
    /** Checks the officer added to this case's plan. */
    addedChecks: [],
    verdict: 'refuse',
    reviewNote: '',
    submitted: false,
  },

  ui: {
    toast: null,
    askOpen: false,
    costOpen: false,
    askThread: [
      { who: 'assistant', text: 'Ask me anything about this presentation — why a finding was raised, whether it can be cured, or what a rule says.' },
    ],
  },
}

function reducer(state, action) {
  switch (action.type) {
    case 'loaded': {
      // A case can arrive already examined. Adopt the run state it comes with
      // rather than assuming every case starts fresh — that is what lets a
      // finished case open straight onto its findings.
      const loaded = action.data.runState
      return {
        ...state,
        loading: false,
        error: null,
        data: action.data,
        run: {
          ...state.run,
          segmentTotal: action.data.totalPages ?? state.run.segmentTotal,
          started: loaded?.started ?? false,
          finished: loaded?.finished ?? false,
          segmented: loaded?.segmented ?? 0,
          completedAreaIds: loaded?.completedAreaIds ?? [],
          activeAreaId: null,
        },
      }
    }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }

    case 'run_started':
      return { ...state, run: { ...state.run, started: true, finished: false, completedAreaIds: [], activeAreaId: null, mode: action.mode } }
    case 'run_mode':
      return { ...state, run: { ...state.run, mode: action.mode } }
    case 'segmented':
      return { ...state, run: { ...state.run, segmented: action.done, segmentTotal: action.total } }
    case 'area_started':
      return { ...state, run: { ...state.run, activeAreaId: action.areaId } }
    case 'area_done':
      return {
        ...state,
        run: {
          ...state.run,
          activeAreaId: null,
          completedAreaIds: state.run.completedAreaIds.includes(action.areaId)
            ? state.run.completedAreaIds
            : [...state.run.completedAreaIds, action.areaId],
        },
      }
    case 'run_finished':
      return { ...state, run: { ...state.run, finished: true, activeAreaId: null, completedAreaIds: action.areaIds } }

    case 'decide':
      return { ...state, officer: { ...state.officer, decisions: { ...state.officer.decisions, [action.findingId]: action.disposition } } }
    case 'draft_note':
      return { ...state, officer: { ...state.officer, drafts: { ...state.officer.drafts, [action.findingId]: action.text } } }
    case 'save_note':
      return {
        ...state,
        officer: {
          ...state.officer,
          notes: { ...state.officer.notes, [action.findingId]: action.text },
          drafts: { ...state.officer.drafts, [action.findingId]: undefined },
          reviewNote: [state.officer.reviewNote, `${action.title} — ${action.text}`].filter(Boolean).join('\n'),
        },
      }
    case 'add_check':
      return { ...state, officer: { ...state.officer, addedChecks: [...state.officer.addedChecks, action.check] } }
    case 'verdict':
      return { ...state, officer: { ...state.officer, verdict: action.verdict } }
    case 'review_note':
      return { ...state, officer: { ...state.officer, reviewNote: action.text } }
    case 'submitted':
      return { ...state, officer: { ...state.officer, submitted: true } }

    case 'toast':
      return { ...state, ui: { ...state.ui, toast: action.message } }
    case 'toggle_ask':
      return { ...state, ui: { ...state.ui, askOpen: !state.ui.askOpen } }
    case 'toggle_cost':
      return { ...state, ui: { ...state.ui, costOpen: !state.ui.costOpen } }
    case 'ask_appended':
      return { ...state, ui: { ...state.ui, askThread: [...state.ui.askThread, ...action.turns] } }
    default:
      return state
  }
}

export function CaseProvider({ caseId, children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const unsubscribe = useRef(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    let alive = true
    api
      .getCase(caseId)
      .then((data) => { if (alive) dispatch({ type: 'loaded', data }) })
      .catch((error) => { if (alive) dispatch({ type: 'load_failed', error: error.message }) })
    return () => { alive = false }
  }, [caseId])

  useEffect(
    () => () => {
      unsubscribe.current?.()
      clearTimeout(toastTimer.current)
    },
    [],
  )

  const flash = useCallback((message) => {
    dispatch({ type: 'toast', message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => dispatch({ type: 'toast', message: null }), 2600)
  }, [])

  const startRun = useCallback(
    (mode) => {
      const areas = state.data?.areas ?? []
      if (!areas.length) return
      unsubscribe.current?.()
      dispatch({ type: 'run_started', mode })
      const segmentTotal = state.data?.totalPages ?? 6
      unsubscribe.current = api.subscribeToRun(caseId, { areas, mode, segmentTotal }, (event) => {
        if (event.type === 'segment') dispatch({ type: 'segmented', done: event.done, total: event.total })
        else if (event.type === 'area_started') dispatch({ type: 'area_started', areaId: event.areaId })
        else if (event.type === 'area_done') dispatch({ type: 'area_done', areaId: event.areaId })
        else if (event.type === 'finished') {
          dispatch({ type: 'run_finished', areaIds: areas.map((a) => a.id) })
          const bad = (state.data?.findings ?? []).filter((f) => f.severity === 'discrepancy').length
          flash(bad ? `Report ready — ${bad} discrepanc${bad === 1 ? 'y' : 'ies'} to look at.` : 'Report ready — nothing to raise.')
        }
      })
    },
    [caseId, state.data, flash],
  )

  // Step mode: the officer advances one area at a time.
  const advanceRun = useCallback(() => {
    const areas = state.data?.areas ?? []
    const next = areas.find((a) => !state.run.completedAreaIds.includes(a.id))
    if (!next) return
    dispatch({ type: 'area_started', areaId: next.id })
    setTimeout(() => {
      dispatch({ type: 'area_done', areaId: next.id })
      const remaining = areas.filter((a) => a.id !== next.id && !state.run.completedAreaIds.includes(a.id))
      if (!remaining.length) {
        dispatch({ type: 'run_finished', areaIds: areas.map((a) => a.id) })
        flash('Report ready — 3 discrepancies to look at.')
      }
    }, 700)
  }, [state.data, state.run.completedAreaIds, flash])

  const decide = useCallback(
    (findingId, disposition) => {
      dispatch({ type: 'decide', findingId, disposition })
      api.recordDecision(caseId, findingId, { disposition }).catch(() => {})
      flash(
        disposition === 'agreed'
          ? 'Added to your review — it will be raised.'
          : disposition === 'parked'
            ? 'Parked — the checker will see it as an open question.'
            : 'Set aside — your call overrides ours and goes to the model team.',
      )
    },
    [caseId, flash],
  )

  const saveNote = useCallback(
    (finding) => {
      const text = state.officer.drafts[finding.id] ?? ''
      dispatch({ type: 'save_note', findingId: finding.id, text, title: finding.title })
      flash('Note saved — it is in your note to the checker.')
    },
    [state.officer.drafts, flash],
  )

  const addCheck = useCallback(async () => {
    const n = state.officer.addedChecks.length + 1
    const check = await api.addCheck(caseId, { name: `Your check ${n} — describe what to look for` })
    dispatch({ type: 'add_check', check })
    flash('Check added to the plan — it runs with the rest.')
  }, [caseId, state.officer.addedChecks.length, flash])

  const submit = useCallback(async () => {
    const { routedTo } = await api.submitCase(caseId, { verdict: state.officer.verdict, note: state.officer.reviewNote })
    dispatch({ type: 'submitted' })
    flash(`Sent to ${routedTo} — your decision and open questions are attached.`)
  }, [caseId, state.officer.verdict, state.officer.reviewNote, flash])

  const askQuestion = useCallback(
    async (question) => {
      dispatch({ type: 'ask_appended', turns: [{ who: 'officer', text: question }] })
      const { answer } = await api.ask(caseId, question)
      dispatch({ type: 'ask_appended', turns: [{ who: 'assistant', text: answer }] })
    },
    [caseId],
  )

  // ---- Derived: what the officer can see right now ------------------------
  //
  // A finding only exists for the UI once the area that produced it has come
  // back. Before that it is not "hidden" — it genuinely has not been found yet.
  const visible = useMemo(() => {
    const data = state.data
    if (!data) return { findings: [], attention: [], clean: [], manual: [] }
    const done = new Set(state.run.completedAreaIds)
    const findings = data.findings.filter((f) => {
      if (f.severity === 'manual') return state.run.finished
      return f.areaId ? done.has(f.areaId) : state.run.finished
    })
    return {
      findings,
      attention: findings.filter(needsAction),
      clean: findings.filter((f) => f.severity === 'clean'),
      manual: findings.filter((f) => f.severity === 'manual'),
    }
  }, [state.data, state.run.completedAreaIds, state.run.finished])

  const value = useMemo(
    () => ({
      ...state,
      caseId,
      visible,
      stages: STAGES,
      actions: { flash, startRun, advanceRun, decide, saveNote, addCheck, submit, askQuestion, dispatch },
    }),
    [state, caseId, visible, flash, startRun, advanceRun, decide, saveNote, addCheck, submit, askQuestion],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCase() {
  const ctx = useContext(CaseContext)
  if (!ctx) throw new Error('useCase must be used inside a CaseProvider')
  return ctx
}
