import { toneOf } from '@shared/lib/tone'

// Severity is domain data; how it looks is a view decision. This is the one
// place the mapping lives.
const MAP = {
  discrepancy: { label: 'Discrepancy', tone: 'error', rank: 0 },
  possible: { label: 'Possible Discrepancy', tone: 'warning', rank: 1 },
  manual: { label: 'Needs Your Review', tone: 'info', rank: 2 },
  clean: { label: 'Clean', tone: 'success', rank: 3 },
}

export function severityMeta(severity) {
  const m = MAP[severity] || MAP.possible
  return { ...m, ...toneOf(m.tone) }
}

/** Everything the officer has to act on, worst first. */
export const needsAction = (f) => f.severity !== 'clean'

export const bySeverity = (a, b) => severityMeta(a.severity).rank - severityMeta(b.severity).rank

// Stage vocabulary. Order is the pipeline order and drives the stage tabs.
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

// Who presses "next". Nothing else differs between the two — the same steps run
// in the same order, and the stage tab follows the run either way.
//
// Deliberately not "Manual": this app already uses that word for a finding no
// rule could settle ("Needs Your Review", severity `manual` above), and in trade
// finance a manual check is a person examining the documents. Either sense would
// have this control appearing to say the officer does the examining. "Step" says
// what the button does and collides with nothing.
export const RUN_MODES = [
  { id: 'auto', label: 'Auto', tip: 'Start it once on Intake and it runs to the report without stopping' },
  { id: 'step', label: 'Step', tip: 'You press to move on — interpret, plan, run the checks, then the report' },
]

// Officer dispositions, in the order they appear as chips on a finding.
export const DISPOSITIONS = [
  { id: 'agreed', icon: 'check', label: 'Agree', tip: 'Agree — this stands as a discrepancy', tone: 'success' },
  { id: 'parked', icon: 'circle-help', label: 'Unsure', tip: 'Park it — you want a second opinion', tone: 'warning' },
  { id: 'rejected', icon: 'x', label: 'Not one', tip: 'Not a discrepancy — your call overrides ours', tone: 'error' },
]

export const dispositionLabel = (d) =>
  d === 'agreed' ? 'Agreed' : d === 'rejected' ? 'Not one' : d === 'parked' ? 'Parked' : 'Open'

export const VERDICTS = [
  { id: 'refuse', label: 'Refuse the presentation', sub: 'Discrepancies stand — advise refusal and hold the documents' },
  { id: 'waiver', label: 'Take up subject to waiver', sub: 'Ask the applicant to waive; pay once they agree' },
  { id: 'second', label: 'Send for a second look', sub: 'You want another checker on it before deciding' },
]
