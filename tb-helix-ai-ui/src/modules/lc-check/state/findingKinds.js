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
// exactly that reason. One component renders it on all four surfaces
// (`components/TierTag`), because a mark meaning "trust this differently" must not
// look different from screen to screen.
// **Four groups, and Plan & Execute, Review and Decision all read them from here.**
//
// The plan used to declare its own — same idea, different labels, different tones,
// and a Gate group the other two did not have at all. So a case was arranged one way
// while it was being planned and another way while it was being decided, and the
// Gate check that refused the presentation appeared under "Rule" on the report. Three
// screens, one definition, one order.
//
// The pill keeps its colour. It is one per section rather than one per row, so it is
// recognition rather than decoration — you learn "green means this credit asked for
// it" once and then read the heading without reading it.
//
// `note` is what shows on the band and is deliberately short: a heading is scanned,
// not read, and a sentence there is read once and skipped every time after. `tip` is
// the full version, on hover, for the one time somebody wants it.
export const KIND_GROUPS = [
  {
    key: 'gate',
    label: 'Gate',
    icon: 'shield-alert',
    tone: 'warning',
    note: 'Before anything is read',
    tip: 'Settled on the credit and the presentation record alone, before a page is read.',
  },
  {
    key: 'rule',
    label: 'Rule',
    icon: 'equal',
    tone: 'blue',
    note: 'From the dictionary',
    tip: 'Standing, approved, the same on every credit.',
  },
  {
    key: 'requirement',
    label: 'Requirement',
    icon: 'list-checks',
    tone: 'green',
    note: "From this credit's 46A and 47A",
    tip: 'Read out of this credit during the run. Different on every case, and reviewed by nobody.',
  },
  {
    key: 'officer',
    label: 'Added by you',
    icon: 'flag',
    tone: 'neutral',
    note: 'Not from a card',
    tip: "Yours. Recorded against your name wherever it appears.",
  },
]

const BY_KEY = Object.fromEntries(KIND_GROUPS.map((g) => [g.key, g]))

/** The group definition for a key — label, icon, tone, note. */
export const kindGroup = (key) => BY_KEY[key] ?? BY_KEY.rule

/**
 * Which group a finding belongs to.
 *
 * Order matters. A person raising something about a rule's subject does not make it
 * the rule's finding, so `officer` is asked first. A gate is asked next, off the area
 * it was filed under — it is a dictionary card like any other, and grouping it by
 * `origin` alone would file the one check that ran before anything was read among the
 * twenty that ran after.
 */
export function kindOf(f) {
  if (f.raisedByOfficer) return 'officer'
  if (f.areaId === 'gate') return 'gate'
  return f.origin === 'credit' ? 'requirement' : 'rule'
}

/** Which group a *planned check* belongs to. Same four, asked of the plan row. */
export function kindOfCheck(c) {
  if (c.origin === 'officer' || c.addedByOfficer) return 'officer'
  if (c.gate) return 'gate'
  return c.origin === 'credit' ? 'requirement' : 'rule'
}

/** The mark: colour and icon for a kind, wherever one row shows its own. */
const MARK = {
  gate: { icon: 'shield-alert', color: '#946400', title: 'A Gate — it ran before anything was read' },
  rule: { icon: 'equal', color: 'var(--me-blue-deep)', title: 'A Rule from the dictionary' },
  requirement: { icon: 'list-checks', color: '#1F7A00', title: "A Requirement, read out of this credit's own text" },
  officer: { icon: 'flag', color: 'var(--me-grey)', title: 'You raised this' },
}

export function kindMark(key) {
  return MARK[key] ?? MARK.rule
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
