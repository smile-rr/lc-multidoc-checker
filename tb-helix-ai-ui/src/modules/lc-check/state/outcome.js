// What came of a check, in one vocabulary, from the plan to the advice.
//
// This replaces three vocabularies that named the same fact three ways and shared
// no word between them: a finding's `severity` (`discrepancy | possible | clean |
// manual`), the officer's `disposition` (`agreed | parked | rejected`) and the
// case's `verdict` (`refuse | waiver | second`). An officer reading a case had to
// translate twice to answer one question — what did we find, and does it stand.
//
// Four values, and the fourth is the default:
//
//   NOT_RUN     no result exists. Never a silent pass.
//   CLEAN       it held.
//   DOUBT       nothing settled it. Waiting on a person.
//   DISCREPANT  a ground to refuse on.
//
// The rule engine already speaks these — `RuleEvaluator` returns PASS / FAIL /
// INCONCLUSIVE for exactly the same three reasons, and the fourth is the case it
// cannot express because it never ran. So this is one vocabulary from the operand
// comparison up to the officer's signature, not a presentation layer over another
// one.
//
// **The nine-value map this replaces was not wrong, it was mis-shelved.** It held
// `pending review` and `unanswerable` separately, and `not run` / `set aside` /
// `not applicable` separately, and it was right to keep those apart — "a check ran
// and could not conclude" is a rule to improve, "nothing tests this" is a rule to
// write, and an examiner has to be able to tell them apart. But they are not
// outcomes. They are *reasons*, and they now ride under the outcome (`REASON`
// below) instead of competing with it for the column. Outcome is what you scan;
// the reason is what you read when the outcome is not self-explanatory.

/**
 * The four, with their chrome.
 *
 * **Shape carries the meaning, so colour does not have to carry it alone.** Each
 * outcome has its own silhouette — a triangle, a question, a tick, a dashed ring —
 * and a triangle among circles is found before any hue is processed.
 *
 * That is what makes a green tick safe here. The earlier draft made CLEAN grey, on
 * the reasoning that fifteen green rows would bury the three red ones; with only a
 * dot to go on, that was true. With four distinct shapes it is not, because the
 * discrepancy is no longer competing on colour to be seen. The saturated green went
 * to the icon and a darker one to the label, so a column of ticks stays quiet while
 * still reading as *clean* rather than as *unremarkable*.
 *
 * `rank` sorts worst-first wherever a list is ordered by what needs attention.
 */
export const OUTCOME = {
  DISCREPANT: {
    label: 'Discrepant',
    rank: 0,
    // A triangle, and the only one in the set. Hazard is the one shape every reader
    // already knows without being taught it, and it is the only outcome that puts a
    // ground on a notice going out over the bank's name.
    icon: 'triangle-alert',
    dot: 'var(--status-error)',
    text: 'var(--status-error)',
    tip: 'A ground to refuse on. It goes out on the advice under field 77J.',
  },
  DOUBT: {
    label: 'In doubt',
    rank: 1,
    // A question, because that is exactly what an unsettled row is: one somebody
    // still has to answer.
    icon: 'circle-help',
    dot: 'var(--status-warning)',
    // Not `--status-warning` itself: amber at 12px on white does not carry.
    text: '#946400',
    tip: 'Nothing settled it. It is waiting on a person, and the reason says why.',
  },
  CLEAN: {
    label: 'Clean',
    rank: 2,
    icon: 'circle-check',
    dot: 'var(--status-success)',
    // The darker green of the two: `--status-success` carries an icon at 13px but
    // reads shrill as a label repeated down fifteen rows.
    text: '#1a7a32',
    tip: 'It held.',
  },
  NOT_RUN: {
    label: 'Not run',
    rank: 3,
    // An outline of nothing. Absence drawn as absence — the one mark in the set with
    // no closed form, so a list that has not run reads as unfinished at a glance.
    icon: 'circle-dashed',
    dot: 'var(--me-grey-20)',
    text: 'var(--me-grey-50)',
    tip: 'No result exists yet.',
  },
}

export const outcomeMeta = (key) => OUTCOME[key] ?? OUTCOME.NOT_RUN

/** Worst first. */
export const byOutcome = (a, b) =>
  outcomeMeta(effectiveOutcome(a)).rank - outcomeMeta(effectiveOutcome(b)).rank

/**
 * Why an outcome is what it is, where the outcome alone does not say.
 *
 * Only two outcomes take one. DISCREPANT and CLEAN are conclusions and explain
 * themselves; DOUBT and NOT_RUN are absences, and an absence is only actionable
 * once you know which kind it is. Each of these was a value of its own in the map
 * this replaces, and each names a different piece of work:
 *
 *   UNANSWERABLE     a check ran and could not conclude — a field to fix.
 *   NO_RULE          nothing on the plan tests this — a rule to write in Governance.
 *   HUMAN_ONLY       the planner said before the run that only a person could settle it.
 *   NOT_REACHED      the plan ended before this ran. Still runnable.
 *   TRIGGER_NOT_MET  this credit never brought it into play.
 *   SET_ASIDE        this credit's own :47A: stood a standing rule down.
 *
 * The last two are answers rather than gaps, which is why `caseStatus` excludes
 * them from the roll-up while `NOT_REACHED` pushes a case to further check.
 */
export const REASON = {
  OFFICER_UNSURE: {
    label: 'you are unsure',
    tip: 'You read it and could not settle it. It goes to the checker as an open question.',
  },
  LOW_CONFIDENCE: {
    label: 'low confidence',
    tip: 'An agent formed a view and was not confident in it. Read the analysis before relying on it.',
  },
  UNANSWERABLE: {
    label: 'unanswerable',
    tip: 'A field this reads was not extracted. A missing input is not evidence of compliance.',
  },
  NO_RULE: {
    label: 'no rule',
    tip: 'Nothing on the plan covers this — a gap to close in Governance.',
  },
  HUMAN_ONLY: {
    label: 'human only',
    tip: 'The plan filed this as something only a person can settle.',
  },
  NOT_REACHED: {
    label: 'not reached',
    tip: 'The plan ended before this ran. You can still run it.',
  },
  TRIGGER_NOT_MET: {
    label: 'not applicable',
    tip: 'This credit never brought the check into play.',
  },
  SET_ASIDE: {
    label: 'set aside',
    tip: "This credit's own terms stood the rule down for this presentation.",
  },
}

export const reasonMeta = (key) => (key ? REASON[key] ?? null : null)

// ---------------------------------------------------------------------------
// The two slots
//
// The machine's outcome is never overwritten. An override is a second value beside
// it, and what every screen reads is the pair resolved. One column could not hold
// this, and the interesting fact in an examination file is precisely the pair:
// *the model called it discrepant and R. Ning cleared it at 14:22*. `lc_officer_action`
// is append-only for the same reason, and this is the read side of it.
// ---------------------------------------------------------------------------

/**
 * What the finding is taken to be — the officer's call where they made one, the
 * machine's where they did not.
 *
 * @param finding   carries `outcome`, the machine's value
 * @param overrides `{ [findingId]: { outcome, by, at } }`, keyed by finding
 */
export function effectiveOutcome(finding, overrides = {}) {
  if (!finding) return 'NOT_RUN'
  return overrides[finding.id]?.outcome ?? finding.outcome ?? 'NOT_RUN'
}

/**
 * The pair, for anything that has to render the seam.
 *
 * `overridden` is what keeps this honest on screen: a row the machine settled and a
 * row a person settled must not look the same, or the screen stops being a record
 * of a review. The renderer is `components/OutcomeCell`.
 */
export function outcomeOf(finding, overrides = {}) {
  const machine = finding?.outcome ?? 'NOT_RUN'
  const override = finding ? overrides[finding.id] : null
  const value = override?.outcome ?? machine
  return {
    machine,
    value,
    overridden: !!override,
    by: override?.by ?? null,
    at: override?.at ?? null,
    // The reason belongs to whoever's outcome is showing. An officer who leaves
    // something in doubt is not reporting that a field failed to extract — they read
    // it and would not settle it, which is a different fact and a different piece of
    // work. Carrying the engine's reason under the officer's value would attribute
    // their judgement to our extraction.
    reason: override
      ? (value === 'DOUBT' ? OFFICER_DOUBT_REASON : null)
      : finding?.outcomeReason ?? null,
  }
}

/**
 * What the officer may write. All three conclusions; never `NOT_RUN`, which is the
 * absence of a run and which nothing asserts.
 *
 * **`DOUBT` is here, and an earlier draft was wrong to leave it out.** The reasoning
 * then was that doubt means *the machine could not settle this* — a statement about
 * the machine's reach rather than about anyone's confidence — so a person had no
 * business writing it. The first half of that still holds; the conclusion did not.
 * An officer who has read the evidence and genuinely cannot settle it had two ways
 * to record that and both were lies: clear it and understate, or call it discrepant
 * and put a ground on a refusal notice they do not stand behind. Meanwhile
 * `FURTHER_CHECK` exists at case level for exactly this and had nothing to route on
 * but the engine's own doubt.
 *
 * What keeps the distinction is the *reason*, which is why reasons are a separate
 * axis: `OFFICER_UNSURE` against `UNANSWERABLE`, `LOW_CONFIDENCE` and `HUMAN_ONLY`.
 * The file still answers "could the engine not settle this, or would the officer
 * not?" — it just no longer answers it by refusing to let them say so.
 */
export const OFFICER_WRITABLE = ['DISCREPANT', 'DOUBT', 'CLEAN']

/** The reason recorded when a person, rather than the engine, leaves something unsettled. */
export const OFFICER_DOUBT_REASON = 'OFFICER_UNSURE'

/**
 * The menu on a finding's outcome: every value it could hold, plus the way back.
 *
 * **This replaced a pair of buttons, and the reason is a defect rather than a
 * preference.** The buttons offered only what would change something, which read
 * well and trapped people: once a row was overridden the only action left was
 * *Undo*, so going from a mistaken Discrepant to Clean meant restoring the engine's
 * answer first and then overriding again — and an officer who had mis-tagged
 * something reasonably read the missing option as "this cannot be changed". Every
 * value being reachable from every other is worth more than a control that never
 * shows a no-op.
 *
 * The reset stays, because *what the engine said* is not one of the three — it is
 * whichever of them the engine reached, and an officer who wants their mark off the
 * row is asking for that rather than for a value.
 *
 * **Four words and an icon each, and nothing else.** The items carried a line of
 * explanation apiece — what a discrepancy is, what doubt means — which is reference
 * material in a place nobody is reading reference material: a menu is opened by
 * somebody who has already decided, and a paragraph under each choice only slows the
 * click they came to make. The vocabulary is explained where it is learned, on the
 * row's own tooltip and in the plan.
 */
export function outcomeOptions({ value, overridden }) {
  const options = OFFICER_WRITABLE.map((id) => ({
    id,
    label: OUTCOME[id].label,
    icon: OUTCOME[id].icon,
    current: id === value,
  }))
  if (!overridden) return options
  return [...options, { id: 'undo', label: 'Restore', icon: 'undo-2', reset: true }]
}

// ---------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------

/**
 * Where a presentation lands. Three values, and the middle one is why the officer
 * is not forced to resolve everything before signing.
 *
 * This replaces the old `VERDICTS` — `refuse | waiver | second look`. Two of those
 * were outcomes wearing an action's clothes and one was a genuine action:
 * take-up-subject-to-waiver does not change what was *found*, it changes what the
 * bank does about it. So it comes back as a secondary act under DISCREPANT rather
 * than as a fourth status that would let the status lie about the examination.
 */
export const CASE_STATUS = {
  DISCREPANT: {
    label: 'Discrepant',
    tone: 'error',
    consequence: 'Refuse and advise under UCP 600 art. 16(c). Every discrepancy below is stated on the notice.',
  },
  FURTHER_CHECK: {
    label: 'Further check',
    tone: 'warning',
    consequence: 'Nothing refuses this presentation yet, but something is unresolved. It goes to the checker as an open question.',
  },
  // The one place hue is spent on a clean result, because here it is one statement
  // about the whole presentation rather than a row among twenty.
  CLEAN: {
    label: 'Clean',
    tone: 'success',
    consequence: 'The presentation complies. Take up and pay in accordance with the credit.',
  },
}

export const caseStatusMeta = (key) => CASE_STATUS[key] ?? CASE_STATUS.FURTHER_CHECK

/**
 * What the findings add up to, before the officer says otherwise.
 *
 * **A check that never ran must not roll up as clean.** That is not a hypothetical:
 * `PlanCheckView.findingId` records the same bug one level down, where a settled
 * check with no finding attached rendered as "passed" — including the threshold
 * check that had just refused the presentation. "Nothing found" is not "nothing
 * wrong".
 *
 * But not every absence is a gap. A check whose trigger this credit never met, or
 * that the planner stood down, is an *answer* — and the planner cannot stand a rule
 * down without raising a card for it, so the officer has already been handed that
 * question. Only a check that was planned, expected and never reached counts here.
 *
 * @param findings  the case's findings, carrying `outcome`
 * @param overrides the officer's calls
 * @param unrun     planned checks that produced no finding, carrying `outcomeReason`
 */
export function caseStatus(findings = [], overrides = {}, unrun = []) {
  const values = findings.map((f) => effectiveOutcome(f, overrides))
  if (values.includes('DISCREPANT')) return 'DISCREPANT'
  if (values.includes('DOUBT')) return 'FURTHER_CHECK'
  if (unrun.some((c) => (c.outcomeReason ?? 'NOT_REACHED') === 'NOT_REACHED')) return 'FURTHER_CHECK'
  return 'CLEAN'
}

/**
 * The four counts, in the order they are read.
 *
 * Note what is *not* here: an "open" or "undecided" count. Everything carries an
 * outcome from the moment it runs, so there is no `0 of 8 decided` left to
 * rubber-stamp a way through. What remains unresolved is DOUBT, which is a final
 * answer in its own right and routes the case to further check.
 */
export function tally(findings = [], overrides = {}, unrunCount = 0) {
  const counts = { DISCREPANT: 0, DOUBT: 0, CLEAN: 0, NOT_RUN: unrunCount }
  for (const f of findings) counts[effectiveOutcome(f, overrides)] += 1
  return ['DISCREPANT', 'DOUBT', 'CLEAN', 'NOT_RUN']
    .filter((k) => counts[k] > 0)
    .map((k) => ({ key: k, n: counts[k], ...OUTCOME[k] }))
}

/** Everything the officer still has to look at. Clean and not-run are not work. */
export const needsAttention = (f, overrides = {}) => {
  const v = effectiveOutcome(f, overrides)
  return v === 'DISCREPANT' || v === 'DOUBT'
}

/**
 * Initials for the override mark.
 *
 * A bank file is annotated and initialled; it is never overwritten. Two characters
 * carry *who* as well as *that* — which a pencil icon cannot, and which a refusal
 * advice has to be able to state.
 */
export function initialsOf(name) {
  if (!name) return '··'
  const parts = String(name).trim().split(/[\s.]+/).filter(Boolean)
  if (!parts.length) return '··'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}
