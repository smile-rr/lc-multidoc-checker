import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
// `trigger` renders inside the same wrapper as the panel's anchor, so clicking
// the trigger is never treated as a click outside.
//
// Positioned fixed and portalled to `document.body`, measured from the trigger's
// rect — the same reason InfoTip is. These menus live inside cards and list
// scrollers with `overflow: hidden|auto`, and an absolutely-positioned panel is
// clipped by those ancestors no matter how high its z-index. A row near the foot
// of the Review findings list (DATE-31D and friends) opened a menu that painted
// into nothing. Fixed + portal escapes the clip; auto-flip keeps it on screen.
const GAP = 4

// Call sites may still pass `top={32}` from the absolute-offset era; it is ignored —
// placement is measured from the trigger now.
export function Menu({ open, onClose, trigger, children, align = 'left', width = 280, maxHeight = 280, drop = 'down' }) {
  const anchorRef = useRef(null)
  const panelRef = useRef(null)
  const [pos, setPos] = useState(null)

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el || typeof window === 'undefined') return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    // Honour an explicit `up`, otherwise flip when the panel would not fit below.
    const wantUp = drop === 'up'
      || (drop === 'down' && spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow)

    let left = align === 'right' ? r.right - width : r.left
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8))

    const available = (wantUp ? spaceAbove : spaceBelow) - GAP - 8
    setPos({
      left,
      top: wantUp ? undefined : r.bottom + GAP,
      bottom: wantUp ? window.innerHeight - r.top + GAP : undefined,
      maxHeight: Math.min(maxHeight, Math.max(96, available)),
    })
  }, [align, drop, maxHeight, width])

  useEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    place()
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      onClose?.()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, onClose, place])

  return (
    <span ref={anchorRef} style={{ position: 'relative', display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}>
      {trigger}
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            zIndex: Z.popover,
            width,
            maxHeight: pos.maxHeight,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--me-grey-20)',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(27,28,30,.16)',
            padding: 6,
            textAlign: 'left',
          }}
        >
          {children}
        </div>,
        document.body,
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
