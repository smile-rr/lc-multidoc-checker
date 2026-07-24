// Small status pill. tone: green | neutral | error | warning | blue.
const TONES = {
  green: { background: 'var(--me-green-20)', color: '#1f7a00', border: 'transparent' },
  neutral: { background: 'var(--me-grey-08)', color: 'var(--me-grey-70)', border: 'var(--me-grey-15)' },
  error: { background: '#fbe3e1', color: 'var(--status-error)', border: 'transparent' },
  warning: { background: '#fbefcf', color: '#946400', border: 'transparent' },
  blue: { background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', border: 'transparent' },
}

export default function Badge({ tone = 'neutral', children }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        background: t.background,
        color: t.color,
        border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </span>
  )
}
