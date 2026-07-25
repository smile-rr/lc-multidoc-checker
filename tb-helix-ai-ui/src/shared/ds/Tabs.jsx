// Underline tab bar. items: [{ id, label, badge }]. `badge` renders a small
// count pill after the label; pass a node for full control.
export default function Tabs({ items, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', ...style }}>
      {items.map((it) => {
        const on = value === it.id
        return (
          <button
            key={it.id}
            onClick={() => onChange?.(it.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px 10px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: on ? 600 : 400,
              color: on ? 'var(--me-ink)' : 'var(--me-grey-70)',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
            {it.badge ? it.badge : null}
          </button>
        )
      })}
    </div>
  )
}
