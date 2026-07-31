import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api/lcCheckApi'
import { STAGES, RUN_STAGES, runStagesFrom, stageAfter, needsAction } from './severity'

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

  /**
   * The stages the run bar drives, as the service declared them.
   *
   * Null until GET /pipeline answers, and every reader falls back to the built-in
   * order meanwhile — so the first paint of a cold case shows the same buttons in
   * the same places rather than an empty bar that fills in a moment later.
   */
  runStages: null,

  run: {
    /**
     * Who presses "next" — see RUN_MODES. The steps and their order are the same
     * either way; the mode decides nothing except whether the run asks.
     */
    mode: 'auto',
    /** Stages of the run that have completed, in order. */
    done: [],
    /** The stage executing right now, if any. */
    activeStage: null,

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
     * Work the service is doing right now, in its own words — "Reading the
     * credit", "Converting the scan to PDF". Null when nothing is in flight.
     *
     * Set from the case on load and from the stream after that, so a workbench
     * opened while intake is still running says what it is waiting for instead of
     * showing an empty case.
     */
    busy: false,
    activity: null,
    /** What stopped it, if a stage failed. A stalled run has to be distinguishable. */
    failure: null,

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
    // Whether a critical failure found by arithmetic should stop the run before
    // any model spend. Set in the plan, before pressing go, so Auto keeps its
    // promise not to surprise you — you chose this.
    stopOnRuleFailure: true,
    // Findings a person raised. Kept apart from the engine's own, because the two
    // carry different weight and a refusal advice has to be able to say which is
    // which — an officer's observation is not a check's output.
    raised: [],
    verdict: 'refuse',
    reviewNote: '',
    submitted: false,
  },

  ui: {
    toast: null,
    askOpen: false,
    costOpen: false,
    logOpen: false,
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
      // A reload lands on a case that may be mid-flight — the reducer takes the
      // service's word for that rather than assuming an idle case, which is what
      // lets a second tab, or a refresh, pick up a run already in progress.
      const busy = loaded?.busy ?? false
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
          done: finished ? (state.runStages ?? RUN_STAGES).map((s) => s.id) : [],
          // A refetch triggered by a progress event must not cancel the step it
          // was reporting on — the run owns activeStage, the load does not.
          activeStage: action.merge ? state.run.activeStage : null,
          segmented: loaded?.segmented ?? 0,
          completedAreaIds: loaded?.completedAreaIds ?? [],
          activeAreaId: action.merge ? state.run.activeAreaId : null,
          busy,
          activity: busy ? (action.merge ? state.run.activity : null) : null,
          failure: loaded?.error ?? null,
          live: action.merge ? state.run.live : false,
          following: action.merge ? state.run.following : true,
        },
      }
    }
    // `activity` is only a label. It deliberately does NOT set `busy` — busy is what
    // decides whether to open a watch stream, and setting it from an event arriving
    // *on* a stream would have the run's own progress open a second connection to
    // the same place. Where the work is being watched from is one question; what
    // the work is is another.
    case 'activity':
      return { ...state, run: { ...state.run, failure: null, activity: action.label } }
    case 'activity_ended':
      return { ...state, run: { ...state.run, activity: null } }
    // A failed stage ends the run, rather than freeing the auto-runner to try the
    // same stage again immediately.
    //
    // This cleared `activeStage` and left the run live and in auto, so the effect
    // below saw nothing executing and started the identical step — with no delay,
    // no attempt limit, and nothing that treated a rejection as a reason to stop.
    // Against a case parked at a later stage, that is a 409 answered and re-asked
    // about a hundred and fifty times a second: 25,640 requests in two and a half
    // minutes, and a third of a gigabyte of log, before anybody noticed.
    //
    // `live: false` is the fix and the whole of it. The failure is on screen and
    // the officer decides what to do about it, which is what officer-paced means.
    case 'stage_failed':
      return { ...state, run: { ...state.run, busy: false, live: false, activity: null, activeStage: null, failure: action.message } }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }

    case 'run_started':
      return {
        ...state,
        run: { ...state.run, started: true, finished: false, done: [], activeStage: null, segmented: 0, completedAreaIds: [], activeAreaId: null, live: true, following: true },
      }
    case 'pipeline':
      // What the service says it can run. Wording and tab placement stay here; the
      // list and its order come from there.
      return { ...state, runStages: runStagesFrom(action.pipeline) }
    case 'run_mode':
      return { ...state, run: { ...state.run, mode: action.mode } }
    case 'stage_started':
      return { ...state, run: { ...state.run, activeStage: action.stageId } }
    case 'stage_done': {
      // The run is finished when it is out of stages — nothing separately decides
      // that, so the two can never disagree.
      const done = state.run.done.includes(action.stageId) ? state.run.done : [...state.run.done, action.stageId]
      const complete = (state.runStages ?? RUN_STAGES).every((s) => done.includes(s.id))
      return {
        ...state,
        run: {
          ...state.run,
          done,
          activeStage: null,
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
    case 'raise_finding':
      return { ...state, officer: { ...state.officer, raised: [...state.officer.raised, action.finding] } }
    case 'unraise_finding':
      return { ...state, officer: { ...state.officer, raised: state.officer.raised.filter((f) => f.id !== action.id) } }
    case 'stop_on_rule_failure':
      return { ...state, officer: { ...state.officer, stopOnRuleFailure: action.on } }
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
    case 'toggle_log':
      return { ...state, ui: { ...state.ui, logOpen: !state.ui.logOpen } }
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

  // `merge` keeps the run's own state — this is a refetch during a run, not a
  // fresh open. Ref rather than state so the stream handler below can call it
  // without being torn down and resubscribed on every event.
  const reload = useCallback(
    (merge = false) =>
      api
        .getCase(caseId)
        .then((data) => dispatch({ type: 'loaded', data, merge }))
        .catch((error) => dispatch({ type: 'load_failed', error: error.message })),
    [caseId],
  )

  useEffect(() => {
    let alive = true
    api
      .getCase(caseId)
      .then((data) => { if (alive) dispatch({ type: 'loaded', data }) })
      .catch((error) => { if (alive) dispatch({ type: 'load_failed', error: error.message }) })
    return () => { alive = false }
  }, [caseId])

  // The pipeline itself — which stages an officer may start, and in what order.
  // Fetched per workbench rather than held globally because it is small, cached by
  // the browser, and a stale copy would put a button on screen the service no
  // longer honours. A failure is silent: the built-in order is the fallback and it
  // is right in every deployment shipped so far.
  useEffect(() => {
    let alive = true
    api.getPipeline()
      .then((pipeline) => { if (alive) dispatch({ type: 'pipeline', pipeline }) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Watches work this browser did not start.
  //
  // Intake begins when the files land, so by the time the workbench mounts it is
  // already running. Without this the officer would sit on a case with no
  // documents in it, waiting for an event nobody had subscribed to — which is
  // exactly what "create check, then a blank screen" was.
  //
  // Opened while the service says it is busy and closed when it stops, so a case
  // that is simply sitting there holds no connection.
  const busy = state.run.busy
  useEffect(() => {
    if (!busy) return undefined
    return api.watchCase(caseId, (event) => {
      if (event.type === 'step_started' || event.type === 'step_finished') {
        dispatch({ type: 'activity', label: event.label })
        // The event says something landed; the case endpoint says what. One
        // description of a case, so the two cannot drift.
        if (event.refresh) reload(true)
      } else if (event.type === 'stage_failed') {
        dispatch({ type: 'stage_failed', message: event.message })
      } else if (event.type === 'awaiting_officer' || event.type === 'gate_halted') {
        dispatch({ type: 'activity_ended' })
        reload(true)
      }
    })
  }, [busy, caseId, reload])

  useEffect(
    () => () => {
      unsubscribe.current?.()
      clearTimeout(toastTimer.current)
    },
    [],
  )

  // The latest state, reachable from a callback that closed over an older one.
  // Needed exactly once — reporting on a refetch that landed after the handler was
  // created — and kept to that one use.
  const stateRef = useRef(state)
  stateRef.current = state

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
      dispatch({ type: 'stage_started', stageId: stepId })
      const segmentTotal = state.data?.totalPages ?? 6
      unsubscribe.current = api.runPipelineStep(caseId, stepId, { areas, segmentTotal }, (event) => {
        if (event.type === 'step_started' || event.type === 'step_finished') {
          // What the stage is doing right now, in its own words. The area bars say
          // how far along; this says which step it is actually on.
          dispatch({ type: 'activity', label: event.label })
          if (event.refresh) reload(true)
        } else if (event.type === 'stage_failed') {
          dispatch({ type: 'stage_failed', message: event.message })
        } else if (event.type === 'segment') dispatch({ type: 'segmented', done: event.done, total: event.total })
        else if (event.type === 'area_started') dispatch({ type: 'area_started', areaId: event.areaId })
        else if (event.type === 'area_done') dispatch({ type: 'area_done', areaId: event.areaId })
        else if (event.type === 'stage_done') {
          dispatch({ type: 'activity_ended' })
          dispatch({ type: 'stage_done', stageId: event.stage, areaIds: areas.map((a) => a.id) })
          // A step produced rows — documents, facts, checks, findings — and the event
          // said so without carrying them. Refetch, then report on what came back:
          // counting findings from the copy loaded before the step ran would report
          // the previous run's number.
          reload(true).then(() => {
            if (event.stage !== 'execute') return
            const bad = (stateRef.current.data?.findings ?? []).filter((f) => f.severity === 'discrepancy').length
            flash(bad ? `Report ready — ${bad} discrepanc${bad === 1 ? 'y' : 'ies'} to look at.` : 'Report ready — nothing to raise.')
          })
        }
      })
    },
    [caseId, state.data, flash, reload],
  )

  /** The officer asking for the next step — the first press also starts the run. */
  const runNext = useCallback(() => {
    if (state.run.activeStage) return
    const next = stageAfter(state.run.done, state.runStages ?? RUN_STAGES)
    if (!next) return
    if (!state.run.started) dispatch({ type: 'run_started' })
    startStep(next.id)
  }, [state.run.activeStage, state.run.done, state.run.started, startStep])

  // Auto: whenever a run is live and nothing is executing, take the next step.
  // Expressed as a consequence of the state rather than as a chain of callbacks,
  // so switching to Auto halfway through a stepped run picks it up from where it
  // stopped instead of stranding it with no button.
  useEffect(() => {
    const { mode, live, started, finished, activeStage, done } = state.run
    if (mode !== 'auto' || !live || !started || finished || activeStage) return
    const next = stageAfter(done, state.runStages ?? RUN_STAGES)
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

  // Raise what the engine did not. An officer examining the pages themselves is
  // the backstop for everything OCR mangled, every box we read the wrong way and
  // every condition no card covers — so the tool has to be there, and what it
  // produces has to be marked as theirs.
  const raiseFinding = useCallback(
    (draft) => {
      const n = state.officer.raised.length + 1
      const finding = {
        id: `officer-${n}`,
        severity: draft.severity ?? 'possible',
        title: draft.title,
        detail: draft.detail ?? '',
        statement: (draft.title ?? '').toUpperCase(),
        docId: draft.docId ?? null,
        page: draft.page ?? null,
        area: 'Raised by you',
        areaId: null,
        checkId: null,
        creditTag: null,
        quote: draft.quote ?? '',
        quoteSource: draft.quoteSource ?? '',
        reason: draft.detail ?? '',
        raisedByOfficer: true,
        settledBy: null,
        source: null,
        comparison: null,
        statementSource: 'officer',
        analysis: { requirement: '', presented: draft.quote ?? '', why: draft.detail ?? '', options: [] },
        analysisMarkdown: draft.detail ?? '',
        trace: [{ key: 'raised by', value: 'the examining officer' }],
      }
      dispatch({ type: 'raise_finding', finding })
      flash('Raised. It sits with the rest of the findings, marked as yours.')
      return finding
    },
    [state.officer.raised.length, flash],
  )

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
    const findings = data.findings
      .filter((f) => {
        if (f.severity === 'manual') return state.run.finished
        return f.areaId ? done.has(f.areaId) : state.run.finished
      })
      .concat(state.officer.raised)
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
      actions: { flash, runNext, decide, saveNote, addCheck, raiseFinding, submit, askQuestion, dispatch },
    }),
    [state, caseId, visible, flash, runNext, decide, saveNote, addCheck, raiseFinding, submit, askQuestion],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCase() {
  const ctx = useContext(CaseContext)
  if (!ctx) throw new Error('useCase must be used inside a CaseProvider')
  return ctx
}
