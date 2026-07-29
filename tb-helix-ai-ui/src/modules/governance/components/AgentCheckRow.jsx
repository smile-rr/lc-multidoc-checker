import Icon from '@shared/ds/Icon'
import Badge from '@shared/ds/Badge'
import Chip from '@shared/ds/Chip'
import { ellipsis } from '@shared/ds/text'
import { TypeBadge } from './Check'

const SEV_TONE = { CRITICAL: 'error', MAJOR: 'warning', MINOR: 'neutral' }
const SEV_LABEL = { CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor' }

// Dense check row inside an agent group: drag handle + active toggle stay; the
// row body opens the single check card (check.onOpen). Default view in agents.
export default function AgentCheckRow({ check }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '18px 18px minmax(0,1fr) 100px 84px 96px 34px 24px', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid var(--me-grey-15)', borderRadius: 10, opacity: check.rowOpacity }}
    >
      {check.showDrag ? (
        <span draggable={check.draggable} onDragStart={check.onDragStart} title="Drag to another group" style={{ color: 'var(--me-grey-50)', cursor: 'grab', display: 'flex' }}><Icon name="grip-vertical" size={16} /></span>
      ) : (
        <span />
      )}
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: check.sevColor }} />
      <button onClick={check.onOpen} style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--me-ink)', ...ellipsis }}>{check.title}</span>
        {check.draft && <Chip size="sm" style={statePill}>Draft</Chip>}
      </button>
      <span><TypeBadge check={check} size="sm" /></span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>
      <span><Badge tone={SEV_TONE[check.severity] || 'neutral'}>{SEV_LABEL[check.severity] || check.severity}</Badge></span>
      <button onClick={check.onToggleActive} title="Enable in this agent" style={{ width: 34, height: 20, borderRadius: 999, border: 'none', background: check.trackBg, position: 'relative', cursor: 'pointer' }}>
        <span style={{ position: 'absolute', top: 2, left: check.knobLeft, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </button>
      <button onClick={check.onOpen} style={{ display: 'flex', justifyContent: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-50)', padding: 0 }}>
        <Icon name="chevron-right" size={18} color="currentColor" />
      </button>
    </div>
  )
}

const statePill = { fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }
