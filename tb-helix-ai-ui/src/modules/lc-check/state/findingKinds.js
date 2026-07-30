// How a finding was settled, and the three groups that follow from it.
//
// This lives on its own because two screens group by it — Review and Decision —
// and they must not drift. An officer arrives at the decision from the findings
// list, and the same finding has to be under the same heading with the same mark
// in both, or the list they just worked through stops being the list they signed.
//
// Two tiers, plus provenance:
//
//   exact    a rule compared extracted fields. Deterministic, same answer every
//            time, and its evidence is arithmetic rather than reasoning.
//   judged   a rule an agent read, or should have. A view was formed, which is
//            where the reading time goes and where the bill is.
//   officer  a person raised it. Not a rule's output at all, and a refusal advice
//            has to be able to say so.
//
// Both of the first two are **Rule cards** — there is one kind of card in the
// dictionary and the tier says how it was settled. See `data/checkSpecs`.
//
// It is deliberately not a taxonomy of subject matter (dates, amounts, parties).
// Subject matter needs domain knowledge to read and changes with every credit;
// this needs neither and is the same on every case.
export const KIND_GROUPS = [
  {
    key: 'exact',
    label: 'Exact',
    icon: 'equal',
    tone: 'blue',
    note: 'An expression over extracted fields. Same answer every time.',
  },
  {
    key: 'judged',
    label: 'Judged',
    icon: 'list-checks',
    tone: 'green',
    note: 'An agent read it and formed a view. Read it before you rely on it.',
  },
  {
    key: 'officer',
    label: 'Raised by you',
    icon: 'flag',
    tone: 'neutral',
    note: "Yours, not a check's. Marked as such wherever it appears.",
  },
]

/**
 * Which group a finding belongs to.
 *
 * `settledBy` travels on every finding built through the fixtures, and officer
 * findings carry the flag instead — checked first, because a person raising
 * something about a rule's subject does not make it a rule finding.
 */
export function kindOf(f) {
  if (f.raisedByOfficer) return 'officer'
  return f.settledBy === 'exact' ? 'exact' : 'judged'
}

/** The mark: colour and icon for a kind, wherever one row shows its own. */
export function kindMark(key) {
  if (key === 'exact') return { icon: 'equal', color: 'var(--me-blue-deep)', title: 'Settled exactly — fields compared, no model' }
  if (key === 'officer') return { icon: 'flag', color: 'var(--me-grey)', title: 'You raised this' }
  return { icon: 'list-checks', color: '#1F7A00', title: 'Judged — an agent read it and formed a view' }
}

/**
 * Group findings by kind, dropping empty groups.
 *
 * @param findings the findings to arrange
 * @param sort optional comparator applied inside each group
 */
export function groupByKind(findings, sort) {
  return KIND_GROUPS
    .map((g) => {
      const items = findings.filter((f) => kindOf(f) === g.key)
      return { ...g, items: sort ? items.slice().sort(sort) : items }
    })
    .filter((g) => g.items.length)
}
