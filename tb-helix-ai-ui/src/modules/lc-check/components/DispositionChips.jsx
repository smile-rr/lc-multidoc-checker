import Icon from '@shared/ds/Icon'
import { toneOf } from '@shared/lib/tone'
import { DISPOSITIONS } from '../state/severity'

// Agree / Unsure / Not one. The three calls an officer can make on a finding.
//
// `variant="icon"` is the compact form for list rows; `variant="labelled"` is the
// form used on the finding being read, where there is room to name the action.
export default function DispositionChips({ value, onPick, variant = 'icon' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: variant === 'icon' ? 6 : 5, whiteSpace: 'nowrap' }}>
      {DISPOSITIONS.map((d) => {
        const on = value === d.id
        const t = toneOf(d.tone)
        const shared = {
          border: `1px solid ${on ? t.text : 'var(--me-grey-20)'}`,
          background: on ? t.wash : '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
        return (
          <button
            key={d.id}
            title={d.tip}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              onPick(d.id)
            }}
            style={
              variant === 'icon'
                ? { ...shared, width: 30, height: 30, borderRadius: 8, padding: 0 }
                : { ...shared, gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12, color: on ? t.text : 'var(--me-grey)' }
            }
          >
            <Icon name={d.icon} size={15} color={on ? t.text : 'var(--me-grey-50)'} />
            {variant === 'labelled' ? <span>{d.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
