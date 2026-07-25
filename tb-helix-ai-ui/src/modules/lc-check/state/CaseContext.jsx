import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api/lcCheckApi'
import { STAGES, PIPELINE_STEPS, stepAfter, needsAction } from './severity'

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
    /**
     * Who presses "next" — see RUN_MODES. The steps and their order are the same
     * either way; the mode decides nothing except whether the run asks.
     */
    mode: 'auto',
    /** Pipeline steps that have completed, in order. */
    done: [],
    /** The step executing right now, if any. */
    activeStep: null,

    /** How many documents the read step has carved out of the bundle so far. */
    segmented: 0,
    segmentTotal: 6,
    /** Areas fully returned, in completion order. */
    completedAreaIds: [],
    /** The area currently being examined, if any. */
    activeAreaId: null,
    started: false,
    finished: false,

    /**
     * True only for a run started in this session. A case can arrive already
     * examined, and the stage tabs must not drag the officer to the report the
     * moment they open one.
     */
    live: false,
    /** The stage tabs follow the run until the officer navigates by hand. */
    following: true,
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
      const finished = loaded?.finished ?? false
      return {
        ...state,
        loading: false,
        error: null,
        data: action.data,
        run: {
          ...state.run,
          segmentTotal: action.data.totalPages ?? state.run.segmentTotal,
          started: loaded?.started ?? false,
          finished,
          // An already-examined case has every step behind it; a fresh one has none.
          done: finished ? PIPELINE_STEPS.map((s) => s.id) : [],
          activeStep: null,
          segmented: loaded?.segmented ?? 0,
          completedAreaIds: loaded?.completedAreaIds ?? [],
          activeAreaId: null,
          live: false,
          following: true,
        },
      }
    }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }

    case 'run_started':
      return {
        ...state,
        run: { ...state.run, started: true, finished: false, done: [], activeStep: null, segmented: 0, completedAreaIds: [], activeAreaId: null, live: true, following: true },
      }
    case 'run_mode':
      return { ...state, run: { ...state.run, mode: action.mode } }
    case 'step_started':
      return { ...state, run: { ...state.run, activeStep: action.stepId } }
    case 'step_done': {
      // The run is finished when it is out of steps — nothing separately decides
      // that, so the two can never disagree.
      const done = state.run.done.includes(action.stepId) ? state.run.done : [...state.run.done, action.stepId]
      const complete = PIPELINE_STEPS.every((s) => done.includes(s.id))
      return {
        ...state,
        run: {
          ...state.run,
          done,
          activeStep: null,
          activeAreaId: null,
          finished: complete,
          completedAreaIds: complete ? action.areaIds ?? state.run.completedAreaIds : state.run.completedAreaIds,
        },
      }
    }
    case 'unfollow':
      return state.run.following ? { ...state, run: { ...state.run, following: false } } : state
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

  // Runs exactly one pipeline step. Both modes go through here — the only
  // difference is who calls it.
  const startStep = useCallback(
    (stepId) => {
      const areas = state.data?.areas ?? []
      if (!areas.length) return
      unsubscribe.current?.()
      dispatch({ type: 'step_started', stepId })
      const segmentTotal = state.data?.totalPages ?? 6
      unsubscribe.current = api.runPipelineStep(caseId, stepId, { areas, segmentTotal }, (event) => {
        if (event.type === 'segment') dispatch({ type: 'segmented', done: event.done, total: event.total })
        else if (event.type === 'area_started') dispatch({ type: 'area_started', areaId: event.areaId })
        else if (event.type === 'area_done') dispatch({ type: 'area_done', areaId: event.areaId })
        else if (event.type === 'step_done') {
          dispatch({ type: 'step_done', stepId: event.stepId, areaIds: areas.map((a) => a.id) })
          if (event.stepId === 'execute') {
            const bad = (state.data?.findings ?? []).filter((f) => f.severity === 'discrepancy').length
            flash(bad ? `Report ready — ${bad} discrepanc${bad === 1 ? 'y' : 'ies'} to look at.` : 'Report ready — nothing to raise.')
          }
        }
      })
    },
    [caseId, state.data, flash],
  )

  /** The officer asking for the next step — the first press also starts the run. */
  const runNext = useCallback(() => {
    if (state.run.activeStep) return
    const next = stepAfter(state.run.done)
    if (!next) return
    if (!state.run.started) dispatch({ type: 'run_started' })
    startStep(next.id)
  }, [state.run.activeStep, state.run.done, state.run.started, startStep])

  // Auto: whenever a run is live and nothing is executing, take the next step.
  // Expressed as a consequence of the state rather than as a chain of callbacks,
  // so switching to Auto halfway through a stepped run picks it up from where it
  // stopped instead of stranding it with no button.
  useEffect(() => {
    const { mode, live, started, finished, activeStep, done } = state.run
    if (mode !== 'auto' || !live || !started || finished || activeStep) return
    const next = stepAfter(done)
    if (next) startStep(next.id)
  }, [state.run, startStep])

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
      actions: { flash, runNext, decide, saveNote, addCheck, submit, askQuestion, dispatch },
    }),
    [state, caseId, visible, flash, runNext, decide, saveNote, addCheck, submit, askQuestion],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCase() {
  const ctx = useContext(CaseContext)
  if (!ctx) throw new Error('useCase must be used inside a CaseProvider')
  return ctx
}
