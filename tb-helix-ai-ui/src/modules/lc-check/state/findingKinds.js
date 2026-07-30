// How a finding was settled, and the three groups that follow from it.
//
// This lives on its own because two screens group by it — Review and Decision —
// and they must not drift. An officer arrives at the decision from the findings
// list, and the same finding has to be under the same heading with the same mark
// in both, or the list they just worked through stops being the list they signed.
//
// Grouped by **where the card came from**, which is the one thing about a finding
// that changes who can answer for it:
//
//   Rule card         a standing card from the dictionary. Authored in Governance,
//                     versioned, approved, the same on every credit. Whether it was
//                     settled by comparing fields or by an agent reading is a
//                     property of the card (its tier), not a different kind of thing
//                     — so both live here.
//   Requirement card  read out of *this* credit's 46A/47A by the planner. Different
//                     on every case, written during the run, reviewed by nobody. A
//                     requirement the planner found no rule for is still one of
//                     these — that is a gap in the rulebook, not a third group.
//   Raised by you     a person raised it. Not a card's output at all, and a refusal
//                     advice has to be able to say so.
//
// It is deliberately not a taxonomy of subject matter (dates, amounts, parties).
// Subject matter needs domain knowledge to read and changes with every credit; this
// needs neither and is the same on every case.
//
// The tier — exact or judged — rides on the row as a mark rather than splitting the
// list, because it answers a different question: not *who can answer for this* but
// *how far can I trust it and what did it cost*. The cost drawer groups by tier for
// exactly that reason.
export const KIND_GROUPS = [
  {
    key: 'rule',
    label: 'Rule card',
    icon: 'equal',
    tone: 'blue',
    note: 'From the dictionary. Standing, approved, the same on every credit.',
  },
  {
    key: 'requirement',
    label: 'Requirement card',
    icon: 'list-checks',
    tone: 'green',
    note: "Read out of this credit's 46A and 47A during the run.",
  },
  {
    key: 'officer',
    label: 'Raised by you',
    icon: 'flag',
    tone: 'neutral',
    note: "Yours, not a card's. Marked as such wherever it appears.",
  },
]

/**
 * Which group a finding belongs to.
 *
 * `origin` travels on every finding built through the fixtures, and officer findings
 * carry the flag instead — checked first, because a person raising something about a
 * rule's subject does not make it the rule's finding.
 */
export function kindOf(f) {
  if (f.raisedByOfficer) return 'officer'
  return f.origin === 'credit' ? 'requirement' : 'rule'
}

/** The mark: colour and icon for a kind, wherever one row shows its own. */
export function kindMark(key) {
  if (key === 'rule') return { icon: 'equal', color: 'var(--me-blue-deep)', title: 'A Rule card from the dictionary' }
  if (key === 'officer') return { icon: 'flag', color: 'var(--me-grey)', title: 'You raised this' }
  return { icon: 'list-checks', color: '#1F7A00', title: "A Requirement card, read out of this credit's own text" }
}

/** The tier mark: how it was settled, and therefore how far to trust it. */
export function tierMark(tier) {
  return tier === 'exact'
    ? { label: 'exact', color: 'var(--me-blue-deep)', title: 'Fields compared. No model, same answer every time.' }
    : { label: 'judged', color: '#1F7A00', title: 'An agent read it and formed a view. Read it before you rely on it.' }
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
