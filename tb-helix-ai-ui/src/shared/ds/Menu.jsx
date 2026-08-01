import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { Z } from './z'

// The one dropdown surface.
//
// Every "pick one from a list" in the console — a reference article, a field, a
// document type, an agent, a card kind — is this component. They were each
// hand-rolled before, which is how they drifted: different paddings, different
// close behaviour, and a shared item style whose `alignItems: center` silently
// became *horizontal* centring wherever a call site stacked the label over a
// hint. An item here always reads from the left.
//
// `trigger` renders inside the same wrapper as the panel, so clicking the
// trigger is never treated as a click outside.
export function Menu({ open, onClose, trigger, children, align = 'left', top = 30, width = 280, maxHeight = 280, drop = 'down' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}>
      {trigger}
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            // `up` is for a trigger that sits at the foot of a clipped panel — the
            // raise form inside FloatingPanel — where opening down would be cut off.
            ...(drop === 'up' ? { bottom: '100%', marginBottom: 4 } : { top }),
            [align]: 0, zIndex: Z.popover,
            width, maxHeight, overflowY: 'auto',
            background: '#fff', border: '1px solid var(--me-grey-20)', borderRadius: 10,
            boxShadow: '0 12px 30px rgba(27,28,30,.16)', padding: 6,
            textAlign: 'left',
          }}
        >
          {children}
        </div>
      )}
    </span>
  )
}

// One choice. `hint` sits under the label; `icon` leads it; `tone="danger"` for
// the one destructive entry a menu is allowed.
//
// `color` overrides the icon's grey for a menu whose items *are* a colour vocabulary
// — picking an outcome, say, where the hue is part of what you are choosing rather
// than decoration on it. Left alone everywhere else, because a menu of ordinary
// choices with a colour per row is a menu that has stopped ranking anything.
export function MenuItem({ label, hint, icon, mono, tone, color, selected, onClick, title }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      title={title}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: hint ? 'flex-start' : 'center', gap: 9,
        padding: '8px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
        background: selected ? 'var(--me-blue-20)' : 'transparent',
        color: tone === 'danger' ? 'var(--status-error)' : 'var(--me-ink)',
      }}
    >
      {icon && <span style={{ flexShrink: 0, display: 'flex', color: tone === 'danger' ? 'currentColor' : color ?? 'var(--me-grey-70)', paddingTop: hint ? 1 : 0 }}><Icon name={icon} size={15} color="currentColor" /></span>}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: hint ? 600 : 500, color: 'inherit', fontFamily: mono ? 'var(--font-mono)' : 'inherit', textAlign: 'left' }}>{label}</span>
        {hint && <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--me-grey-70)', textAlign: 'left' }}>{hint}</span>}
      </span>
    </button>
  )
}

// A section label inside a menu — never on its own, always above the items it names.
export function MenuHeader({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--me-grey-70)', padding: '6px 9px 4px' }}>
      {children}
    </div>
  )
}

// What to say when there is nothing to pick. Say why, not "no results".
export function MenuEmpty({ children }) {
  return <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--me-grey-70)', padding: '8px 9px' }}>{children}</div>
}

export default Menu
