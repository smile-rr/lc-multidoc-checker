// Toggle switch with an optional trailing label. onChange receives the boolean.
export default function Switch({ label, checked, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 40,
          height: 24,
          borderRadius: 999,
          border: 'none',
          background: checked ? 'var(--me-blue)' : 'var(--me-grey-20)',
          position: 'relative',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background .15s var(--ease-standard)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transition: 'left .15s var(--ease-standard)',
          }}
        />
      </button>
      {label ? (
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--me-grey)' }}>{label}</span>
      ) : null}
    </label>
  )
}
