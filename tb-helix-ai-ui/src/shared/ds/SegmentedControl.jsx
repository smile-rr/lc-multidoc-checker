// Pill toggle group — the raised-chip-in-a-grey-track pattern the design uses
// for run mode, review grouping and case filters.
// items: [{ id, label, tip }]
export default function SegmentedControl({ items, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? '5px 11px' : '7px 14px'
  const font = size === 'sm' ? 12 : 12.5
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: 3, borderRadius: 999, background: 'var(--me-grey-15)', whiteSpace: 'nowrap' }}>
      {items.map((it) => {
        const on = value === it.id
        return (
          <button
            key={it.id}
            onClick={() => onChange?.(it.id)}
            title={it.tip}
            style={{
              padding: pad,
              borderRadius: 999,
              border: 'none',
              fontSize: font,
              fontWeight: 600,
              cursor: 'pointer',
              background: on ? '#fff' : 'transparent',
              color: on ? 'var(--me-ink)' : 'var(--me-grey)',
              boxShadow: on ? '0 1px 3px rgba(27,28,30,.12)' : 'none',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
