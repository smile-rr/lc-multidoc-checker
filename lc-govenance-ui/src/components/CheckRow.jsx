import Icon from '../ds/Icon'
import Badge from '../ds/Badge'

const SEV_TONE = { CRITICAL: 'error', MAJOR: 'warning', MINOR: 'neutral' }
const SEV_LABEL = { CRITICAL: 'Critical', MAJOR: 'Major', MINOR: 'Minor' }

// Shared column template for the Checks list (header + rows must match).
export const CHECKS_COLS = { display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) 84px 96px minmax(0,1.1fr) 24px', gap: 12, alignItems: 'center' }

// One-line dense row for the Checks list view. Click navigates into the
// Check detail page (check.onOpen).
export default function CheckRow({ check }) {
  return (
    <button
      onClick={check.onOpen}
      style={{ ...CHECKS_COLS, width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', borderBottom: '1px solid var(--me-grey-08)', background: '#fff', cursor: 'pointer', opacity: check.rowOpacity }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: check.sevColor }} />
      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--me-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{check.title}</span>
        {check.draft && <span style={draftPill}>Draft</span>}
        {check.inactive && <span style={{ ...draftPill, color: '#946400', background: '#FBEFCF', border: 'none' }}>Inactive</span>}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--me-grey-70)' }}>{check.id}</span>
      <span><Badge tone={SEV_TONE[check.severity] || 'neutral'}>{SEV_LABEL[check.severity] || check.severity}</Badge></span>
      <span style={{ fontSize: 12, color: 'var(--me-grey-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{check.inLabel}</span>
      <span style={{ display: 'flex', justifyContent: 'flex-end', color: 'var(--me-grey-50)' }}>
        <Icon name="chevron-right" size={18} color="currentColor" />
      </span>
    </button>
  )
}

const draftPill = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--me-grey-70)', background: 'var(--me-grey-08)', border: '1px solid var(--me-grey-15)', borderRadius: 999, padding: '1px 7px', flexShrink: 0 }
