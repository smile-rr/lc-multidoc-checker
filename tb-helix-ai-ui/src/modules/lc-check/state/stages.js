// The stage vocabulary — where a case can be, and which of those places run.
//
// This file was `severity.js` and held two unrelated things: the stages, and a
// four-value severity map that graded findings. The grading moved to
// `state/outcome.js`, which owns the one vocabulary the plan, the review and the
// decision now share. What is left here is places and buttons, and the file is
// named for it — a module called `severity` containing no severity is exactly the
// drift this codebase spends its comments guarding against.

// Order is the pipeline order and drives the stage tabs.
export const STAGES = [
  { id: 'intake', label: 'Intake' },
  // "Interpret", not "Read", because the officer reads too. This stage is the
  // machine turning a scan into facts it can be wrong about — the screen already
  // flags pages it found hard to read, and a word that admits judgement invites
  // the scrutiny those flags are asking for. "Read" sounds infallible.
  { id: 'interpret', label: 'Interpret' },
  { id: 'checks', label: 'Plan & Execute' },
  { id: 'review', label: 'Review' },
  { id: 'decide', label: 'Decision' },
]

// The stages above are places to look. These are the things that actually run.
//
// **The service says which stages exist and who may start each; this says how each
// one is worded and which tab it lives on.** That split is the whole point: a stage
// added to the pipeline used to be invisible here until somebody remembered to add
// it, and the only thing that noticed was a console warning nobody was reading.
//
// The two lists are still not the same length, and should not be forced to be:
//
//   · Intake runs by itself — it is the presentation as it arrived, and it gets no
//     button because there is nothing to press.
//   · The gate runs with the plan, so it is one press.
//   · Signoff is reached from the decision screen, not the run bar.
//   · Planning and executing share the Plan & Execute tab but are separate acts. A
//     plan the officer cannot amend before it executes is not a plan, and "Add a
//     check" has no meaning without a moment between the two.
const STAGE_COPY = {
  interpret: { stage: 'interpret', action: 'Interpret the documents', running: 'Interpreting the documents…', badge: 'Interpreting' },
  plan: { stage: 'checks', action: 'Plan the checks', running: 'Planning the checks…', badge: 'Planning' },
  execute: { stage: 'checks', action: 'Run the checks', running: 'Running the checks…', badge: 'Running Checks' },
}

// Stages the run bar never drives, however the service describes them.
const NOT_ON_THE_RUN_BAR = ['signoff']

/** Wording for a stage the UI has never heard of — visible, rather than missing. */
const improvise = (id) => ({
  stage: 'checks',
  action: `Run ${id}`,
  running: `Running ${id}…`,
  badge: id.charAt(0).toUpperCase() + id.slice(1),
})

/**
 * The run bar, derived from what the service says it can run.
 *
 * Order comes from the service too, because the order stages run in is the
 * service's business and duplicating it here is how the button that runs "plan"
 * ends up before the one that runs "interpret".
 *
 * @param {object[]} pipeline  GET /lc-check/pipeline — empty before it has loaded
 */
export function runStagesFrom(pipeline) {
  if (!Array.isArray(pipeline) || pipeline.length === 0) return DEFAULT_RUN_STAGES
  return pipeline
    .filter((s) => s.officerStarts && !NOT_ON_THE_RUN_BAR.includes(s.stage))
    .map((s) => ({ id: s.stage, ...(STAGE_COPY[s.stage] ?? improvise(s.stage)) }))
}

// What the bar shows before the pipeline has arrived — the first paint of a case
// opened from a cold start. Same shape, same order, so nothing moves underneath the
// officer when the real answer lands a moment later.
const DEFAULT_RUN_STAGES = Object.entries(STAGE_COPY).map(([id, copy]) => ({ id, ...copy }))

export const RUN_STAGES = DEFAULT_RUN_STAGES

export const stageMeta = (id, stages = RUN_STAGES) => stages.find((s) => s.id === id) ?? null

/**
 * What the service can run that this UI has no wording for.
 *
 * Existence is no longer something the two can disagree about — the run bar is built
 * from the service's answer. What can still go wrong is a stage arriving that nobody
 * has written a button label for, and that is worth saying out loud: the officer gets
 * "Run reconcile" rather than a considered sentence, which works but reads like a
 * placeholder because it is one.
 *
 * @param {object[]} pipeline  GET /lc-check/pipeline
 * @returns {string[]} complaints, empty when every runnable stage has wording
 */
export function pipelineDisagreements(pipeline) {
  if (!Array.isArray(pipeline) || pipeline.length === 0) return []
  return pipeline
    .filter((s) => s.officerStarts && !NOT_ON_THE_RUN_BAR.includes(s.stage) && !STAGE_COPY[s.stage])
    .map((s) => `the service can run "${s.stage}" and the run bar has no wording for it`)
}

/** The next stage that has not run, or null when the run is out of stages. */
export const stageAfter = (doneIds, stages = RUN_STAGES) => stages.find((s) => !doneIds.includes(s.id)) ?? null

/**
 * Progress for each stage *tab* — run vs pending, not which tab is selected.
 *
 * The five tabs are places to look; only some of them run. Selection is the blue
 * underline on the header; the number on each tab answers a different question —
 * has this place's work happened yet. Deriving "past" from the selected tab made
 * Decision paint 1–4 green on a case that had never left Intake.
 *
 * @returns {'done'|'running'|'pending'}
 */
export function tabProgress(tabId, { done = [], activeStage = null, finished = false, stoppedAfterPlan = false, creditReady = false, busy = false } = {}) {
  const running = (id) => activeStage === id
  switch (tabId) {
    case 'intake':
      // Intake has no run-bar step; the credit fields landing is the finish line.
      if (creditReady) return 'done'
      return busy && !activeStage ? 'running' : 'pending'
    case 'interpret':
      if (running('interpret')) return 'running'
      return done.includes('interpret') ? 'done' : 'pending'
    case 'checks':
      if (running('plan') || running('execute')) return 'running'
      // Plan alone is enough: Step parks here between plan and execute, and the
      // tab already holds the plan. Waiting for execute would keep it grey while
      // the officer is looking at a finished plan.
      if (done.includes('execute') || done.includes('plan') || stoppedAfterPlan) return 'done'
      return 'pending'
    case 'review':
      // Findings exist once execute has run, or the plan stopped short and left
      // the officer something to read. Not a machine stage of its own.
      if (finished || done.includes('execute') || stoppedAfterPlan) return 'done'
      return 'pending'
    case 'decide':
      return finished ? 'done' : 'pending'
    default:
      return 'pending'
  }
}

/**
 * Where an unattended run should leave the officer, as a tab id.
 *
 * The service answers `decision` — the act, which is what it is deciding about. The
 * tabs are named for places you can be, and that place is `decide`. One translation,
 * here, next to the rest of the stage vocabulary, rather than a `=== 'decision'`
 * appearing in three components that each get it slightly differently.
 */
export const destinationTab = (destination) => (destination === 'decision' ? 'decide' : 'review')

// Full pipeline order, including stages the run bar never shows (intake, gate, signoff).
// `runState.stage` is the last stage that finished — not the one waiting to be asked for.
const PIPELINE_ORDER = ['intake', 'interpret', 'gate', 'plan', 'execute', 'signoff']

/**
 * Which run-bar steps are already behind the case, given where the service says it sits.
 *
 * Needed on every load/refetch: a merge that wiped `done` to [] made Step report
 * "Paused · 0 of 3" after Interpret and Auto try the same stage again.
 */
export function doneThroughStage(stageKey, stages = RUN_STAGES) {
  if (!stageKey) return []
  const at = PIPELINE_ORDER.indexOf(stageKey)
  if (at < 0) return []
  return stages
    .filter((s) => {
      const i = PIPELINE_ORDER.indexOf(s.id)
      return i >= 0 && i <= at
    })
    .map((s) => s.id)
}

// Who presses "next". Nothing else differs between the two — the same steps run
// in the same order, and the stage tab follows the run either way.
//
// Deliberately not "Manual": in trade finance a manual check is a person examining
// the documents, so that word here would have the control appearing to say the
// officer does the examining. "Step" says what the button does and collides with
// nothing.
export const RUN_MODES = [
  { id: 'auto', label: 'Auto', tip: 'Start it once on Intake and it runs to the report without stopping' },
  { id: 'step', label: 'Step', tip: 'You press to move on — interpret, plan, run the checks, then the report' },
]

// `DISPOSITIONS` and `VERDICTS` used to live here. Both are gone, and neither was
// replaced in kind:
//
//   Agree · Unsure · Not one     an officer now writes only CLEAN or DISCREPANT, and
//                                only where it would change something. Agreeing with
//                                a discrepancy the system found is not an act.
//   Refuse · Waiver · Second     the case's status is derived from its outcomes
//                                (`CASE_STATUS` in state/outcome.js). Waiver came
//                                back as an action under Discrepant, because asking
//                                for a waiver does not change what was found.
