import Icon from '@shared/ds/Icon'

// Previous / page-count / next, as used above every document viewer.
export default function PageNav({ page, total, onPrev, onNext }) {
  const canPrev = page > 1
  const canNext = page < total
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <Step label="Previous" icon="chevron-left" enabled={canPrev} onClick={onPrev} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--me-grey)', minWidth: 86, textAlign: 'center' }}>
        Page {page} of {total}
      </span>
      <Step label="Next" icon="chevron-right" enabled={canNext} onClick={onNext} iconAfter />
    </div>
  )
}

function Step({ label, icon, enabled, onClick, iconAfter }) {
  return (
    <button
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 7,
        border: 'none',
        background: 'none',
        fontSize: 12.5,
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--me-grey)' : 'var(--me-grey-50)',
      }}
    >
      {iconAfter ? null : <Icon name={icon} size={15} />}
      <span>{label}</span>
      {iconAfter ? <Icon name={icon} size={15} /> : null}
    </button>
  )
}
