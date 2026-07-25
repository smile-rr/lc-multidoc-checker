import { toneOf } from '@shared/lib/tone'

// Severity is domain data; how it looks is a view decision. This is the one
// place the mapping lives.
const MAP = {
  discrepancy: { label: 'Discrepancy', tone: 'error', rank: 0 },
  possible: { label: 'Possible discrepancy', tone: 'warning', rank: 1 },
  manual: { label: 'Needs your review', tone: 'info', rank: 2 },
  clean: { label: 'Clean', tone: 'success', rank: 3 },
}

export function severityMeta(severity) {
  const m = MAP[severity] || MAP.possible
  return { ...m, ...toneOf(m.tone) }
}

/** Everything the officer has to act on, worst first. */
export const needsAction = (f) => f.severity !== 'clean'

export const bySeverity = (a, b) => severityMeta(a.severity).rank - severityMeta(b.severity).rank

// Stage vocabulary. Order is the pipeline order and drives the step tabs.
export const STAGES = [
  { id: 'intake', label: 'Intake' },
  { id: 'read', label: 'Read' },
  { id: 'checks', label: 'Plan & Execute' },
  { id: 'review', label: 'Review' },
  { id: 'decide', label: 'Decision' },
]

export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id)

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
