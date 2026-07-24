// Labelled native select. options: [{ label, value }].
export default function Select({ label, options = [], value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label ? (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--me-grey)' }}>{label}</label>
      ) : null}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          height: 46,
          border: '1px solid var(--me-grey-20)',
          borderRadius: 8,
          padding: '0 14px',
          fontSize: 14,
          color: 'var(--me-ink)',
          background: '#fff',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
