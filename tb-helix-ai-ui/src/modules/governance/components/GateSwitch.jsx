import Icon from '@shared/ds/Icon'

/**
 * A gate is a flag, and it is drawn as one.
 *
 * It had a panel: a filled amber band, a 20px toggle, the word Gate, a sentence restating
 * what Gate means, and — on a second row, behind its own label — a segmented control with
 * two long options. Five devices for one boolean and one enum, on a card whose whole point
 * is that everything else is a line of text.
 *
 * One row now. The checkbox says whether, the select says what a failure does, and neither
 * repeats the other.
 *
 * The sentence survives only where it is an ANSWER rather than a caption: when the check
 * cannot run first, the control is disabled and the reason takes the space. An author who
 * wants a gate needs to know what would make one, and a control that vanishes teaches
 * nothing — but a control that explains itself when nobody asked is just noise on every
 * other card.
 *
 * @param check `gateOn`, `gateEligible`, `gateWhy`, `onFail`, `onToggleGate`, `onSetOnFail`
 */
export default function GateSwitch({ check }) {
  const on = check.gateOn
  const can = check.gateEligible

  return (
    <div style={row}>
      <button
        onClick={check.onToggleGate ?? undefined}
        disabled={!can}
        role="checkbox"
        aria-checked={on}
        // Only where it is not obvious. The reason is beside it when it is disabled, and
        // when it is available the label says what it is.
        title={can ? undefined : check.gateWhy}
        style={box(can, on)}
      >
        <Icon name={on ? 'square-check' : 'square'} size={15} color="currentColor" />
        Gate
      </button>

      {can && on ? (
        <>
          <span style={quiet}>if it fails</span>
          <select
            value={check.onFail ?? 'STOP'}
            onChange={(e) => check.onSetOnFail(e.target.value)}
            style={pick}
          >
            <option value="STOP">Stop the examination</option>
            <option value="CONTINUE">Keep examining</option>
          </select>
        </>
      ) : null}

      {!can ? <span style={quiet}>{check.gateWhy}</span> : null}
    </div>
  )
}

const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }
const box = (can, on) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
  background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
  fontSize: 12, fontWeight: 600,
  cursor: can ? 'pointer' : 'not-allowed',
  color: !can ? 'var(--me-grey-50)' : on ? 'var(--me-ink)' : 'var(--me-grey-70)',
})
const quiet = { fontSize: 11.5, color: 'var(--me-grey-50)' }
const pick = {
  fontFamily: 'inherit', fontSize: 11.5, padding: '1px 4px', borderRadius: 5,
  border: '1px solid var(--me-grey-20)', background: '#fff', color: 'var(--me-grey)',
  cursor: 'pointer',
}
