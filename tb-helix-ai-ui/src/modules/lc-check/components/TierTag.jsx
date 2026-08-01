import Icon from '@shared/ds/Icon'
import { SETTLED_BY, TIER_META } from '../data/checkSpecs'

// Who settled a finding, rendered the same way on every surface that shows it.
//
// The list is grouped by *provenance* — a Rule from the dictionary, a Requirement
// read out of this credit — because that decides who can answer for a finding. This
// answers the other question, and an officer needs it on every screen: on the plan
// to know how much of the work is theirs, in the findings list to know how much
// reading a row deserves, and on the decision to know whether the wording can go out
// as written.
//
// The words are **Comparison** and **Agent**, the same two the plan's "Settled by"
// column uses and the same two an author picks in Governance. They were "exact" and
// "judged", which named a property of the answer and left the reader to work out what
// had produced it — and which meant the plan, the report and the console each had a
// slightly different name for one thing.
//
// One component rather than four inline copies, because a mark that means "trust this
// differently" must not look different from screen to screen — that is exactly the
// mark you learn once and then read without looking.
//
// `size="dot"` is the icon alone, for rows too narrow for a word. It keeps the same
// colour and the same tooltip, so it is the same mark rather than a second one.
// `overridden` moves the answer to **Manual**, and it outranks whatever the check was.
//
// This column asks *who gives the answer*, and once a person has overruled the engine
// the answer is theirs — a row still reading "Comparison" would be crediting a sum
// nobody is relying on any more. It is the same word the plan uses for a check only a
// person can settle, which is exactly what this row has become.
//
// It follows that an override moves the row in the list too: Review and Decision sort
// by this, manual last, so an officer's own calls collect at the foot of their group
// rather than staying filed under the machinery that was overruled.
export default function TierTag({ tier, checkType, overridden = false, size = 'text' }) {
  if (!tier && !overridden) return null
  const by = overridden ? SETTLED_BY.manual : SETTLED_BY[tier === 'exact' ? 'comparison' : 'agent']
  const meta = TIER_META[checkType]
  const title = overridden
    ? `${by.label} — you overruled the engine, so this one is settled by a person.`
    : `${by.label} — ${by.note}${meta ? `\n${checkType}: ${meta.note}` : ''}`

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        color: by.color, cursor: 'help',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap',
      }}
    >
      <Icon name={by.icon} size={11} color="currentColor" />
      {size === 'dot' ? null : by.label}
    </span>
  )
}
