import Chip from '@shared/ds/Chip'
import Icon from '@shared/ds/Icon'

// The band that opens a group of checks or findings.
//
// One component because three screens draw it — the plan, the report and the
// decision — and an officer walks all three in one sitting on one case. They were
// three near-identical blocks of JSX that had already drifted: different labels for
// the same group, different tones, and a Gate section that existed on only one of
// them. A card has to be under the same heading with the same colour wherever it
// appears, or the list somebody worked through stops being the list they sign.
//
// The pill keeps its colour. It is one per section rather than one per row, so it is
// recognition and not decoration: you learn "green is what this credit asked for"
// once, and afterwards you find the group without reading it.
//
// @param group   a KIND_GROUPS entry — label, icon, tone, note
// @param count   how many are in it
// @param aside   optional right-hand summary, `{ text, warn }`
// @param onToggle collapsible when given; the whole band becomes the control
// @param open    whether it is currently expanded
export default function KindGroupHeader({ group, count, aside, onToggle, open = true, showNote = true }) {
  const body = (
    <>
      {onToggle ? (
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" />
      ) : null}
      <Chip size="sm" tone={group.tone ?? 'neutral'}>
        {group.icon ? <Icon name={group.icon} size={11} /> : null}
        {group.label}
      </Chip>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{count}</span>
      {showNote && group.note ? (
        <span style={{ fontSize: 11.5, color: 'var(--me-grey-70)' }}>{group.note}</span>
      ) : null}
      {aside ? (
        <>
          <div style={{ flex: 1 }} />
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, whiteSpace: 'nowrap',
              color: aside.warn ? '#946400' : 'var(--me-grey-70)',
            }}
          >
            {aside.warn ? <Icon name="circle-alert" size={12} color="currentColor" /> : null}
            {aside.text}
          </span>
        </>
      ) : null}
    </>
  )

  const skin = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    textAlign: 'left',
    padding: '8px 16px',
    background: 'var(--me-grey-08)',
    borderBottom: '1px solid var(--me-grey-15)',
    flexWrap: 'wrap',
  }

  if (!onToggle) return <div style={skin} title={group.tip}>{body}</div>
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      title={group.tip ?? (open ? `Fold ${group.label} away` : `Show the ${count} in ${group.label}`)}
      style={{ ...skin, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
    >
      {body}
    </button>
  )
}
