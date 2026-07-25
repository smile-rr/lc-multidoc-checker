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
// The two lists are not the same length and should not be forced to be:
//
//   · Intake runs nothing — it is the presentation as it arrived, and the last
//     point at which a wrong bundle costs nothing to catch.
//   · Planning and executing share the Plan & Execute tab but are separate acts.
//     A plan the officer cannot amend before it executes is not a plan, and
//     "Add a check" has no meaning without a moment between the two.
//   · Review runs nothing either. The findings are already there; opening the
//     report is navigation, and the button that does it says so.
export const PIPELINE_STEPS = [
  { id: 'interpret', stage: 'interpret', action: 'Interpret the documents', running: 'Interpreting the documents…', badge: 'Interpreting' },
  { id: 'plan', stage: 'checks', action: 'Plan the checks', running: 'Planning the checks…', badge: 'Planning' },
  { id: 'execute', stage: 'checks', action: 'Run the checks', running: 'Running the checks…', badge: 'Running Checks' },
]

export const stepMeta = (id) => PIPELINE_STEPS.find((s) => s.id === id) ?? null

/** The next step that has not run, or null when the run is out of steps. */
export const stepAfter = (doneIds) => PIPELINE_STEPS.find((s) => !doneIds.includes(s.id)) ?? null

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
