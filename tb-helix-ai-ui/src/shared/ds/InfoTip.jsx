import { useState, useRef, useCallback, useEffect, useId } from 'react'
import Icon from './Icon'
import { Z } from './z'

// The one way this app explains a term.
//
// WHY NOT title=""
// Native tooltips look free and are not: about a second of delay before they
// appear, no styling, long text truncated by the platform, nothing at all on
// touch, and inconsistent screen-reader behaviour. Our explanations run to two or
// three sentences and cite UCP articles — that is popover content, not a
// title attribute.
//
// WHY NOT CLICK-ONLY, AND WHY NOT HOVER-ONLY
// Neither serves everyone. Hover is fastest when scanning a dense grid with a
// mouse, but a touch user has no hover and a keyboard user never reaches it.
// Click is reliable everywhere but slow when checking six definitions in a row.
// So this opens on **hover, focus and click**, which costs nothing extra and
// leaves no input method out:
//
//   hover  →  opens after a short delay, closes on leave
//   focus  →  opens (keyboard reaches it via Tab)
//   click  →  pins it open, so it survives the mouse leaving while you read
//   Esc / outside click / second click  →  closes
//
// TWO PRESENTATIONS, ONE RULE
//   trigger="underline"  the label itself, dotted — for dense grids, where a
//                        column of ? icons would be more chrome than data
//   trigger="icon"       a ? icon — for a section heading or anywhere there is
//                        no natural word to underline
//
// Positioned fixed and measured from the trigger's rect, because these live
// inside panels with `overflow: hidden` and an absolutely-positioned bubble
// would be clipped.

const OPEN_DELAY = 120
const WIDTH = 268
const GAP = 8

export default function InfoTip({ children, label, trigger = 'underline', title }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState(null)

  const anchorRef = useRef(null)
  const timer = useRef(null)
  const id = useId()

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el || typeof window === 'undefined') return
    const r = el.getBoundingClientRect()

    // Prefer below; flip above when there is not room, so it never runs off.
    const below = window.innerHeight - r.bottom
    const flip = below < 150 && r.top > below

    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8),
      top: flip ? undefined : r.bottom + GAP,
      bottom: flip ? window.innerHeight - r.top + GAP : undefined,
    })
  }, [])

  const show = useCallback(() => { place(); setOpen(true) }, [place])
  const hide = useCallback(() => { if (!pinned) setOpen(false) }, [pinned])

  const onEnter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(show, OPEN_DELAY)
  }
  const onLeave = () => {
    clearTimeout(timer.current)
    hide()
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  // Pinned tips dismiss on Escape or a click anywhere else — the same two
  // gestures that dismiss every other transient surface in the app.
  useEffect(() => {
    if (!pinned) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setPinned(false); setOpen(false) } }
    const onDown = (e) => {
      if (!anchorRef.current?.contains(e.target)) { setPinned(false); setOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [pinned])

  // Reposition while open, so scrolling the page does not strand the bubble.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const toggle = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (pinned) { setPinned(false); setOpen(false) } else { setPinned(true); show() }
  }

  const shared = {
    ref: anchorRef,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onFocus: show,
    onBlur: hide,
    onClick: toggle,
    'aria-describedby': open ? id : undefined,
    'aria-expanded': open,
  }

  return (
    <>
      {trigger === 'icon' ? (
        <button
          {...shared}
          type="button"
          aria-label={title ? `About ${title}` : 'Explain this'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, padding: 0, borderRadius: 999,
            border: 'none', background: 'none', cursor: 'help',
            color: open ? 'var(--me-blue)' : 'var(--me-grey-50)', verticalAlign: 'middle',
          }}
        >
          <Icon name="help-circle" size={14} color="currentColor" />
        </button>
      ) : (
        <button
          {...shared}
          type="button"
          style={{
            font: 'inherit', color: 'inherit', padding: 0, border: 'none', background: 'none',
            cursor: 'help', textAlign: 'left',
            borderBottom: `1px dotted ${open ? 'var(--me-blue)' : 'var(--me-grey-50)'}`,
          }}
        >
          {label}
        </button>
      )}

      {open && pos ? (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: WIDTH,
            zIndex: Z.popover,
            background: 'var(--me-ink)',
            color: '#fff',
            borderRadius: 8,
            padding: '9px 11px',
            fontSize: 11.5,
            lineHeight: 1.55,
            boxShadow: '0 8px 24px rgba(27,28,30,.28)',
            pointerEvents: 'none',
          }}
        >
          {title ? (
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>{title}</span>
          ) : null}
          {children}
        </span>
      ) : null}
    </>
  )
}
