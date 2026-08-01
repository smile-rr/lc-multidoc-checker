import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useMemo } from 'react'
import * as api from '../api/lcCheckApi'
import { STAGES, RUN_STAGES, runStagesFrom, stageAfter, doneThroughStage, destinationTab } from './stages'
import { effectiveOutcome, outcomeOf, needsAttention, caseStatus } from './outcome'

/**
 * Maps extract / extract-md step events onto a doc-rail mark.
 *
 * One document at a time: spinner on the doc currently being read, check when
 * its layout pass finishes. The backend walks documents sequentially, so the
 * rail should too — lighting every row at once hides which one is in flight.
 *
 * @returns {{ code: string, status: 'working'|'done'|'failed' } | null}
 */
function extractMark(step, type, status) {
  const m = /^(extract(?:-md)?):(.+)$/.exec(step || '')
  if (!m) return null
  const [, kind, code] = m
  if (type === 'step_started') {
    return { code, status: 'working' }
  }
  if (type === 'step_finished') {
    if (status && String(status).toUpperCase() === 'FAILED') return { code, status: 'failed' }
    // Fields done → still working (layout follows). Layout done → complete.
    return { code, status: kind === 'extract-md' ? 'done' : 'working' }
  }
  return null
}

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
    /**
     * Per-document extract progress during interpret.
     * Keys are doc codes (INV, BOL, …); values are working | done | failed.
     * Cleared when a new interpret starts.
     */
    docExtract: {},
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
     * A hard check stopped the examination, and the id of the check that did it.
     *
     * Deliberately not folded into `failure`. Nothing went wrong: the system did
     * exactly what it was asked and the answer is that this presentation cannot
     * proceed. Nor is it a pause — the workbench used to call it one, which reads
     * as "still going" and offers a button that runs the same gate into the same
     * wall. It ends the run and asks the officer a question only they can answer.
     */
    halted: false,
    haltedBy: null,

    /**
     * The plan weighed a a gate failing against this credit and decided the
     * remaining checks were spend on a question already settled.
     *
     * Deliberately not `halted`. Nothing is blocked: the case parks at `execute`
     * like any other and the ordinary run button finishes it. All this changes is
     * that Auto stops chaining — a run that carried on regardless would make the
     * decision pointless, and one that offered no way back would make it final,
     * which it is not. `stoppedBecause` is the planner's reason, shown on screen so
     * the officer can disagree with something specific.
     */
    stoppedAfterPlan: false,
    stoppedBecause: null,
    /** Planned checks not yet run. What the "run them anyway" button counts. */
    remaining: 0,
    /** Planned checks nothing but a person can settle. Nought means Auto ends at the decision. */
    humanReview: 0,
    /**
     * Where Auto leaves the officer, as a tab id: `decide` normally, `review` when
     * the plan holds something a person has to settle.
     *
     * The service's answer, not one worked out here. It follows from the plan, and
     * a browser deriving it again from a copy of the plan is a second opinion that
     * can disagree with the first. `review` until it has answered, which is where
     * every run used to end.
     */
    destination: 'review',

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
    /**
     * findingId -> `{ outcome, by, at }` — where, and only where, the officer
     * disagreed with the engine.
     *
     * **This holds overrides, not decisions.** It used to hold one disposition per
     * finding, defaulted on read, and then materialised for every row at sign-off so
     * the file could show somebody had accepted each ground. All of that existed to
     * work around a vocabulary in which the officer's silence had no meaning. It has
     * one now: the outcome the engine reached stands, and it is already written down.
     * So this map is sparse by construction, it is only ever written by a deliberate
     * act, and every key in it is a place a person overruled the machine.
     */
    overrides: {},
    /** findingId -> note text (saved) */
    notes: {},
    /** findingId -> note text (in the box, unsaved) */
    drafts: {},
    /** Checks the officer added to this case's plan. */
    addedChecks: [],
    // There used to be a `stopOnRuleFailure` here — a checkbox on the plan saying
    // whether a failed exact rule should stop the run before any model spend. That
    // question now has an answer with more behind it: Governance authors what a
    // a gate failing means (`onFail`), and the planner weighs it against this
    // credit's own :47A: before deciding. A third control asking the same thing in
    // the browser could only disagree with them.
    // Findings a person raised. Kept apart from the engine's own, because the two
    // carry different weight and a refusal advice has to be able to say which is
    // which — an officer's observation is not a check's output.
    raised: [],
    /**
     * The case's status where the officer set one by hand; null means the derived
     * value stands. Same two slots as a finding's outcome, one level up.
     */
    status: null,
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
      const bar = state.runStages ?? RUN_STAGES
      // From the service's last-finished stage — never wipe to [] on a merge.
      // That reset made Step show "Paused · 0 of 3" after Interpret and left
      // Auto asking for the same stage again until the service rejected it.
      // A run the plan ended is finished *and* has a stage that never ran. Marking
      // every stage done because the run is over would leave the officer with "Open
      // the report" where the only useful button is "run the checks that were
      // skipped" — the run is over, and the work is not.
      const fromService = finished && !action.data.runState?.stoppedAfterPlan
        ? bar.map((s) => s.id)
        : doneThroughStage(loaded?.stage, bar)
      // Keep anything this tab already recorded if the service answer is behind
      // (e.g. stage_done landed before the refetch sees the new park).
      const done = [...new Set([...fromService, ...(action.merge ? state.run.done : [])])]
      const halted = Boolean(loaded?.halted)
      const stoppedAfterPlan = Boolean(loaded?.stoppedAfterPlan)
      return {
        ...state,
        loading: false,
        error: null,
        data: action.data,
        run: {
          ...state.run,
          segmentTotal: action.data.totalPages ?? state.run.segmentTotal,
          started: Boolean(loaded?.started || state.run.started),
          finished,
          done,
          halted,
          haltedBy: loaded?.haltedBy ?? null,
          stoppedAfterPlan,
          stoppedBecause: loaded?.stoppedBecause ?? null,
          remaining: loaded?.remaining ?? 0,
          humanReview: loaded?.humanReview ?? 0,
          destination: destinationTab(loaded?.destination),
          // The run owns activeStage. The load does not — not on a merge, and not
          // on a plain load either, which is what this used to say.
          //
          // Clearing it on a non-merge load meant any refetch during a running
          // stage told the auto-runner that nothing was executing, so it started
          // the same stage again. Four concurrent interprets on one case, each
          // extracting the same six documents, every one of them writing events:
          // the quadruple rows in the run log were four real runs, not one run
          // reported four times.
          // …except when a hard check has stopped it. Nothing is executing then, and
          // leaving the stage set leaves the button reading "Running…" forever.
          activeStage: halted ? null : state.run.activeStage,
          segmented: loaded?.segmented ?? 0,
          completedAreaIds: loaded?.completedAreaIds ?? [],
          activeAreaId: action.merge ? state.run.activeAreaId : null,
          busy,
          activity: busy ? (action.merge ? state.run.activity : null) : null,
          failure: loaded?.error ?? null,
          // A halted run is over until an officer overrides it, so the auto-runner
          // must not find it live and try the next stage.
          live: halted ? false : action.merge ? state.run.live : false,
          following: action.merge ? state.run.following : true,
        },
        officer: {
          ...state.officer,
          // Adopted from the service on a full load, so opening a case someone already
          // worked keeps the seam — with the officer id and timestamp the file actually
          // recorded, which is what the mark on the row has to name.
          //
          // **Not on a merge.** A merge is a refetch during a run, and an override is
          // written optimistically then POSTed; adopting the server's copy here would
          // drop any call made in the moment between the two. The same rule the run
          // state above follows, for the same reason.
          overrides: action.merge
            ? state.officer.overrides
            : Object.fromEntries(
              (action.data.overrides ?? []).map((o) => [o.findingId, { outcome: o.outcome, by: o.by, at: o.at }]),
            ),
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
    // The halt is released. The finding stays where it is — this says only that the
    // examination may go on, which is why it does not touch findings or status.
    case 'gate_overridden':
      return { ...state, run: { ...state.run, halted: false, haltedBy: null, live: true, following: true } }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }

    case 'run_started':
      return {
        ...state,
        run: { ...state.run, started: true, finished: false, done: [], activeStage: null, segmented: 0, docExtract: {}, completedAreaIds: [], activeAreaId: null, live: true, following: true, failure: null },
      }
    case 'resume_run':
      // Pick up a parked case without wiping `done` — run_started is only for a cold start.
      return {
        ...state,
        run: { ...state.run, started: true, live: true, following: true, failure: null },
      }
    case 'pipeline':
      // What the service says it can run. Wording and tab placement stay here; the
      // list and its order come from there.
      return { ...state, runStages: runStagesFrom(action.pipeline) }
    case 'run_mode':
      return { ...state, run: { ...state.run, mode: action.mode } }
    case 'stage_started':
      return {
        ...state,
        run: {
          ...state.run,
          activeStage: action.stageId,
          // Fresh extract markers only when interpret starts — other stages
          // leave the last read's ticks alone so the rail still says what was done.
          docExtract: action.stageId === 'interpret' ? {} : state.run.docExtract,
        },
      }
    case 'doc_extract': {
      const { code, status } = action
      if (!code || !status) return state
      if (state.run.docExtract[code] === status) return state
      return {
        ...state,
        run: { ...state.run, docExtract: { ...state.run.docExtract, [code]: status } },
      }
    }
    case 'stage_done': {
      // The run is finished when it is out of stages — nothing separately decides
      // that, so the two can never disagree.
      const done = state.run.done.includes(action.stageId) ? state.run.done : [...state.run.done, action.stageId]
      const complete = (state.runStages ?? RUN_STAGES).every((s) => done.includes(s.id))
      // **A stage finishing only ends the run when it is the stage that was running.**
      //
      // One press can run two stages: the gate declares itself WITH_NEXT, so asking
      // for the plan runs gate *then* plan, and each publishes its own stage_done.
      // Clearing `activeStage` on the first of them told the workbench that plan had
      // finished while plan was still going — and in Auto that is not a cosmetic lie.
      // The auto-runner saw nothing running, asked for plan a second time, tore down
      // the stream it was already listening on, and got 409 already_running back.
      // `runPipelineStep` reports a refused start as `stage_failed`, which sets
      // `live: false` — so Auto died at the plan stage on every single run, with the
      // events from the real plan stage going to a subscription nobody held.
      const wasActive = state.run.activeStage === action.stageId
      return {
        ...state,
        run: {
          ...state.run,
          done,
          activeStage: wasActive ? null : state.run.activeStage,
          activeAreaId: wasActive ? null : state.run.activeAreaId,
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

    // The officer overruling the engine on one finding, and taking it back. Two
    // actions rather than one that also accepts null, because "I disagree" and "I
    // withdraw my disagreement" are different entries in the file.
    case 'override':
      return {
        ...state,
        officer: {
          ...state.officer,
          overrides: {
            ...state.officer.overrides,
            [action.findingId]: { outcome: action.outcome, by: action.by, at: action.at },
          },
        },
      }
    case 'undo_override': {
      const { [action.findingId]: _dropped, ...rest } = state.officer.overrides
      return { ...state, officer: { ...state.officer, overrides: rest } }
    }
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
    case 'add_check':
      return { ...state, officer: { ...state.officer, addedChecks: [...state.officer.addedChecks, action.check] } }
    case 'case_status':
      return { ...state, officer: { ...state.officer, status: action.status } }
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
  // Synchronous latch against double-clicks / auto-effect races. React state
  // (`activeStage`) only flips after a render; two clicks in the same tick both
  // saw it null and both POSTed — which is how one interpret became four on the
  // wire. The service now 409s duplicates; this stops the duplicate request.
  const startGate = useRef(false)

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

  // A new case must not inherit a latch left closed by the previous one's run.
  useEffect(() => { startGate.current = false }, [caseId])

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

  // The latest state, reachable from a callback that closed over an older one.
  // Needed exactly once — reporting on a refetch that landed after the handler was
  // created — and by the passive watcher below.
  const stateRef = useRef(state)
  stateRef.current = state

  //
  // Intake begins when the files land, so by the time the workbench mounts it is
  // already running. Without this the officer would sit on a case with no
  // documents in it, waiting for an event nobody had subscribed to — which is
  // exactly what "create check, then a blank screen" was.
  //
  // Opened while the service says it is busy and closed when it stops, so a case
  // that is simply sitting there holds no connection.
  //
  // Same extract / segment handling as startStep: a workbench opened mid-interpret
  // must still light the rail marks, not only the activity label.
  //
  // **And the same stage handling**, which it did not have. This watcher dispatched
  // `activity` and nothing else, so `run.activeStage` stayed null for every run this
  // tab did not personally start — a reload mid-plan, a second tab, and every stage
  // Auto chained after the first. Everything that asks "what is running" reads that
  // field, so the workbench reported a case that was actively planning as "not
  // planned yet": the system was working and the screen said it had not begun.
  const busy = state.run.busy
  useEffect(() => {
    if (!busy) return undefined
    return api.watchCase(caseId, (event) => {
      if (event.type === 'step_started' || event.type === 'step_finished') {
        dispatch({ type: 'activity', label: event.label })
        const mark = extractMark(event.step, event.type, event.status)
        if (mark) dispatch({ type: 'doc_extract', code: mark.code, status: mark.status })
        if (event.refresh) reload(true)
      } else if (event.type === 'stage_started') {
        dispatch({ type: 'stage_started', stageId: event.stage })
      } else if (event.type === 'stage_done') {
        dispatch({ type: 'activity_ended' })
        dispatch({ type: 'stage_done', stageId: event.stage, areaIds: stateRef.current.data?.areas?.map((a) => a.id) })
        reload(true)
      } else if (event.type === 'segment') {
        dispatch({ type: 'segmented', done: event.done, total: event.total })
      } else if (event.type === 'area_started') {
        dispatch({ type: 'area_started', areaId: event.areaId })
      } else if (event.type === 'area_done') {
        dispatch({ type: 'area_done', areaId: event.areaId })
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

  const flash = useCallback((message) => {
    dispatch({ type: 'toast', message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => dispatch({ type: 'toast', message: null }), 2600)
  }, [])

  // Runs exactly one pipeline step. Both modes go through here — the only
  // difference is who calls it.
  const startStep = useCallback(
    (stepId) => {
      const snap = stateRef.current.run
      if (startGate.current || snap.activeStage || snap.busy) return
      const areas = stateRef.current.data?.areas ?? []
      if (!areas.length) return
      startGate.current = true
      unsubscribe.current?.()
      dispatch({ type: 'stage_started', stageId: stepId })
      const segmentTotal = stateRef.current.data?.totalPages ?? 6
      unsubscribe.current = api.runPipelineStep(caseId, stepId, { areas, segmentTotal }, (event) => {
        if (event.type === 'step_started' || event.type === 'step_finished') {
          // What the stage is doing right now, in its own words. The area bars say
          // how far along; this says which step it is actually on.
          dispatch({ type: 'activity', label: event.label })
          const mark = extractMark(event.step, event.type, event.status)
          if (mark) dispatch({ type: 'doc_extract', code: mark.code, status: mark.status })
          if (event.refresh) reload(true)
        } else if (event.type === 'stage_failed') {
          startGate.current = false
          dispatch({ type: 'stage_failed', message: event.message })
        } else if (event.type === 'gate_halted') {
          startGate.current = false
          dispatch({ type: 'activity_ended' })
          reload(true)
        } else if (event.type === 'segment') dispatch({ type: 'segmented', done: event.done, total: event.total })
        else if (event.type === 'area_started') dispatch({ type: 'area_started', areaId: event.areaId })
        else if (event.type === 'area_done') dispatch({ type: 'area_done', areaId: event.areaId })
        else if (event.type === 'stage_done') {
          // Only the stage this call asked for releases the latch. An intermediate
          // stage — the gate riding along with the plan — is recorded and nothing
          // more; releasing on it would let a second start through the door.
          const mine = event.stage === stepId
          if (mine) startGate.current = false
          if (mine) dispatch({ type: 'activity_ended' })
          dispatch({ type: 'stage_done', stageId: event.stage, areaIds: areas.map((a) => a.id) })
          if (!mine) return
          // A step produced rows — documents, facts, checks, findings — and the event
          // said so without carrying them. Refetch, then report on what came back:
          // counting findings from the copy loaded before the step ran would report
          // the previous run's number.
          reload(true).then(() => {
            if (event.stage !== 'execute') return
            const bad = (stateRef.current.data?.findings ?? []).filter((f) => f.outcome === 'DISCREPANT').length
            flash(bad ? `Report ready — ${bad} discrepanc${bad === 1 ? 'y' : 'ies'} to look at.` : 'Report ready — nothing to raise.')
          })
        }
      })
    },
    [caseId, flash, reload],
  )

  /** The officer asking for the next step — the first press also starts the run. */
  const runNext = useCallback(() => {
    const snap = stateRef.current.run
    if (startGate.current || snap.activeStage || snap.busy) return
    const next = stageAfter(snap.done, stateRef.current.runStages ?? RUN_STAGES)
    if (!next) return
    if (!snap.started) dispatch({ type: 'run_started' })
    else if (!snap.live) dispatch({ type: 'resume_run' })
    startStep(next.id)
  }, [startStep])

  /**
   * The officer accepts the gate's ground and lets the examination continue.
   *
   * Reloads rather than assuming: the service decides whether the halt is really
   * released, and the case comes back saying so. Then the run resumes from where
   * it stopped — the same `runNext` an unhalted case would use, because after an
   * override there is nothing special about this case any more.
   */
  const overrideGate = useCallback(async (note) => {
    try {
      await api.overrideGate(caseId, { note })
      await reload(true)
      dispatch({ type: 'gate_overridden' })
    } catch (e) {
      flash(e.message ?? 'The halt could not be released')
    }
  }, [caseId, reload, flash])

  // Auto: whenever a run is live and nothing is executing, take the next step.
  // Expressed as a consequence of the state rather than as a chain of callbacks,
  // so switching to Auto halfway through a stepped run picks it up from where it
  // stopped instead of stranding it with no button.
  useEffect(() => {
    const { mode, live, started, finished, activeStage, done, busy, stoppedAfterPlan } = state.run
    // `busy` as well as `activeStage`: the first is the service saying a stage is
    // running, the second is this tab saying it started one. Either is a reason
    // not to start another, and relying on our own flag alone is what let a
    // second tab — or a reload — pile a run on top of a run.
    if (mode !== 'auto' || !live || !started || finished || activeStage || busy) return
    // The plan decided the rest was not worth running. Auto respects that — a
    // chained execute here would spend the money the decision existed to save, and
    // would do it without anybody seeing the reason it was not supposed to.
    if (stoppedAfterPlan) return
    const next = stageAfter(done, state.runStages ?? RUN_STAGES)
    if (next) startStep(next.id)
  }, [state.run, startStep])

  /**
   * What a finding is taken to be — the officer's call where they made one, the
   * engine's where they did not.
   *
   * **The system's conclusion stands unless somebody disagrees with it.** An
   * examination that finds eight discrepancies and then asks the officer to click
   * "Agree" eight times has not saved anyone anything — it has moved the work and
   * added a step, and the complaint writes itself: the AI made more work, not less.
   * The value is in the exceptions, so the exceptions are what attention is spent on.
   *
   * The old safety argument — *the machine's answer may carry itself; its silence may
   * not* — is still the whole point, and it is now carried by the vocabulary rather
   * than by a defaulting rule. A check that concluded says DISCREPANT or CLEAN and
   * that conclusion stands. A check that could not says DOUBT, and DOUBT is not a
   * ground: it never reaches a refusal notice, and it routes the case to further
   * check by itself. Nothing has to remember to withhold a default, because there is
   * no default to withhold.
   *
   * `overridden` is what keeps this honest on screen: a row the engine settled and a
   * row a person settled must not look the same, or the screen stops being a record
   * of a review.
   */
  const callOf = useCallback(
    (finding) => outcomeOf(finding, state.officer.overrides),
    [state.officer.overrides],
  )

  // ---- Derived: what the officer can see right now ------------------------
  //
  // A finding only exists for the UI once the area that produced it has come
  // back. Before that it is not "hidden" — it genuinely has not been found yet.
  const visible = useMemo(() => {
    const data = state.data
    if (!data) return { findings: [], attention: [], clean: [], doubt: [] }
    const done = new Set(state.run.completedAreaIds)
    const overrides = state.officer.overrides
    const findings = data.findings
      .filter((f) => {
        // A finding nothing settled has no area to have come back — it is complete
        // only once the run is.
        if (f.outcome === 'DOUBT' && !f.areaId) return state.run.finished
        return f.areaId ? done.has(f.areaId) : state.run.finished
      })
      .concat(state.officer.raised)
    return {
      findings,
      // Buckets read through the officer's calls, not the engine's raw values: a
      // discrepancy somebody cleared is not attention any more, and a clean row
      // somebody raised is. Reading `f.outcome` here is what would have the counts
      // on the header disagree with the list under it.
      attention: findings.filter((f) => needsAttention(f, overrides)),
      clean: findings.filter((f) => effectiveOutcome(f, overrides) === 'CLEAN'),
      doubt: findings.filter((f) => effectiveOutcome(f, overrides) === 'DOUBT'),
    }
  }, [state.data, state.run.completedAreaIds, state.run.finished, state.officer.raised, state.officer.overrides])

  /**
   * Where this presentation lands, and whether anybody said so by hand.
   *
   * Checks that were planned and never reached count toward further check; ones this
   * credit never triggered, or that the planner stood down, do not — they are answers
   * rather than gaps, and the planner cannot stand a rule down without raising a card
   * for it. See `caseStatus`.
   */
  const status = useMemo(() => {
    const unrun = (state.data?.checks ?? []).filter((c) => !c.findingId && !c.notCovered)
    const derived = caseStatus(visible.findings, state.officer.overrides, unrun)
    return { derived, value: state.officer.status ?? derived, chosen: !!state.officer.status }
  }, [state.data, visible.findings, state.officer.overrides, state.officer.status])


  /**
   * The officer overruling the engine on one finding — or taking it back.
   *
   * `action` is an outcome the officer may write (`CLEAN` / `DISCREPANT`) or the
   * literal `'undo'`. Never `DOUBT`: doubt is the engine reporting the limit of its
   * own reach, not a confidence a person records. Never `NOT_RUN`: that is the
   * absence of a run, and nothing asserts it.
   */
  const override = useCallback(
    (findingId, action) => {
      if (action === 'undo') {
        dispatch({ type: 'undo_override', findingId })
        api.clearOverride(caseId, findingId).catch(() => {})
        flash("Reverted to the system's own outcome.")
        return
      }
      const by = state.data?.officer ?? 'You'
      const at = new Date().toISOString()
      dispatch({ type: 'override', findingId, outcome: action, by, at })
      api.recordOverride(caseId, findingId, { outcome: action, by }).catch(() => {})
      flash(
        action === 'CLEAN'
          ? 'Cleared — your call overrides ours, and the file records both.'
          : 'Called discrepant — it will be stated on the advice.',
      )
    },
    [caseId, state.data, flash],
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
        // An officer raising something has already formed the view — that is what
        // raising is. It defaults to a discrepancy, and the same override control
        // clears it if they change their mind. It is never DOUBT: a person does not
        // record their own uncertainty as the engine's inability to conclude.
        outcome: draft.outcome ?? 'DISCREPANT',
        outcomeReason: null,
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

  /**
   * Signs the case off.
   *
   * This used to walk every finding first and write out the disposition each one had
   * merely been *taken* to have, so that nothing reached a refusal notice as a ground
   * the file could not show somebody had accepted. That loop is gone, and nothing
   * replaced it: an outcome is written when the check produces it, an override is
   * written when the officer makes it, and neither was ever an assumption needing to
   * be made real at the end. What the officer signs is the status, which is one act
   * over a list they can see.
   */
  const submit = useCallback(async () => {
    const { routedTo } = await api.submitCase(caseId, {
      status: status.value,
      note: state.officer.reviewNote,
    })
    dispatch({ type: 'submitted' })
    flash(`Sent to ${routedTo} — your decision and open questions are attached.`)
  }, [caseId, status.value, state.officer.reviewNote, flash])

  const askQuestion = useCallback(
    async (question) => {
      dispatch({ type: 'ask_appended', turns: [{ who: 'officer', text: question }] })
      const { answer } = await api.ask(caseId, question)
      dispatch({ type: 'ask_appended', turns: [{ who: 'assistant', text: answer }] })
    },
    [caseId],
  )

  const value = useMemo(
    () => ({
      ...state,
      caseId,
      visible,
      stages: STAGES,
      callOf,
      status,
      actions: { flash, runNext, overrideGate, override, saveNote, addCheck, raiseFinding, submit, askQuestion, dispatch },
    }),
    [state, caseId, visible, callOf, status, flash, runNext, overrideGate, override, saveNote, addCheck, raiseFinding, submit, askQuestion],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCase() {
  const ctx = useContext(CaseContext)
  if (!ctx) throw new Error('useCase must be used inside a CaseProvider')
  return ctx
}
