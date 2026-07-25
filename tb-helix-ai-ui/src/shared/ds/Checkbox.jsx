import Icon from './Icon'

// Checkbox with a trailing label. onChange receives the boolean.
export default function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={!!checked}
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          flexShrink: 0,
          border: `1.5px solid ${checked ? 'var(--me-blue)' : 'var(--me-grey-20)'}`,
          background: checked ? 'var(--me-blue)' : '#fff',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {checked ? <Icon name="check" size={12} color="#fff" /> : null}
      </button>
      {label ? (
        <span style={{ fontSize: 13, color: 'var(--me-grey)', lineHeight: 1.4 }}>{label}</span>
      ) : null}
    </label>
  )
}
