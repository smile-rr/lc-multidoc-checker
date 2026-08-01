import Icon from './Icon'

// An inline statement about the thing it sits inside.
//
// There were four of these, hand-rolled, in three files: the same `#FBEFCF` on the
// same `#E9C97A`, each with its own padding and its own idea of where the icon goes.
// They are one component, and having them be one is what keeps the next amber box
// from being a fifth shade of amber.
//
// **Inline, and deliberately not a notification system.** This app already has two
// places for things to be said: `Toast` for what just happened, and the status badge
// in the case header for what is true now. A third floating surface would be a third
// place to look and the one nobody checks. A Notice is *about the content beside it*
// and lives with that content — which is also why it takes no `onDismiss`: a
// statement that can be waved away is one the officer can be asked about later and
// truthfully say they never saw.
//
// Use it for a consequence the reader must weigh before acting. Not for a label
// (that is a Chip), not for a count (that is text), and not for anything the row it
// describes could say for itself.
const TONES = {
  warning: { bg: '#FBEFCF', border: '#E9C97A', ink: '#946400', icon: 'circle-alert' },
  info: { bg: 'var(--me-blue-20)', border: 'var(--me-blue-20)', ink: 'var(--me-blue-deep)', icon: 'info' },
  error: { bg: '#FBE3E1', border: '#F0B5B1', ink: 'var(--status-error)', icon: 'circle-x' },
  neutral: { bg: 'var(--me-grey-08)', border: 'var(--me-grey-15)', ink: 'var(--me-grey)', icon: 'info' },
}

/**
 * @param tone     warning | info | error | neutral
 * @param title    the claim, in one line. Optional — a Notice with only a body is fine
 *                 where the body *is* the claim.
 * @param icon     lucide name, when the tone's default is not specific enough
 * @param actions  [{ label, onClick, primary }] — rendered as links, in the order the
 *                 reader should consider them. The one that costs least to undo first.
 */
export default function Notice({ tone = 'warning', title, icon, actions = [], children, style }) {
  const t = TONES[tone] ?? TONES.warning
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '10px 13px',
        border: `1px solid ${t.border}`,
        background: t.bg,
        borderRadius: 10,
        ...style,
      }}
    >
      <Icon name={icon ?? t.icon} size={15} color={t.ink} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {title ? (
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: t.ink }}>{title}</span>
        ) : null}
        {children ? (
          <span style={{ fontSize: 12, lineHeight: 1.55, color: title ? 'var(--me-grey)' : t.ink }}>{children}</span>
        ) : null}
        {actions.length ? (
          <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 1 }}>
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: 600,
                  color: a.primary ? t.ink : 'var(--me-blue)',
                }}
              >
                {a.label}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
