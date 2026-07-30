import Icon from '@shared/ds/Icon'
import { TIER_META } from '../data/checkSpecs'

// How a card was settled, rendered the same way on every surface that shows it.
//
// The list is grouped by *provenance* — a Rule card from the dictionary, a Requirement
// card read out of this credit — because that decides who can answer for a finding.
// The tier answers the other question, and an officer needs it on all four screens:
// on the plan to know what a run will cost, in the findings list to know how much
// reading a row deserves, and on the decision to know whether the wording can go out
// as written.
//
// One component rather than four inline copies, because a mark that means "trust this
// differently" must not look different from screen to screen — that is exactly the
// mark you learn once and then read without looking.
//
// `size="dot"` is the icon alone, for rows too narrow for a word. It keeps the same
// colour and the same tooltip, so it is the same mark rather than a second one.
export default function TierTag({ tier, checkType, size = 'text' }) {
  if (!tier) return null
  const exact = tier === 'exact'
  const color = exact ? 'var(--me-blue-deep)' : '#1F7A00'
  const meta = TIER_META[checkType]
  const title = exact
    ? `Exact — an expression over extracted fields. No model, no cost, the same answer every time.${meta ? `\n${checkType}: ${meta.note}` : ''}`
    : `Judged — an agent read it and formed a view. Read it before you rely on it.${meta ? `\n${checkType}: ${meta.note}` : ''}`

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        color, cursor: 'help',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap',
      }}
    >
      <Icon name={exact ? 'equal' : 'list-checks'} size={11} color="currentColor" />
      {size === 'dot' ? null : (exact ? 'exact' : 'judged')}
    </span>
  )
}
