import { useCallback, useEffect, useRef, useState } from 'react'
import { Z } from './z'
import Icon from './Icon'

// A panel that floats over the page without taking it.
//
// `Drawer` is the other kind: a scrim, the page inert behind it, Esc to leave.
// That is right for something you open, read and dismiss — the run cost, an
// answer to a question. It is wrong for anything you want to *watch while you
// work*, because the thing you were working on is exactly what it covers and
// disables.
//
// So: no backdrop, nothing behind it disabled, and two states rather than one.
// Minimised it is a title bar with whatever the caller puts in `status` — which
// is the state it spends most of its time in, so the status line is the feature
// and not a consolation. Expanded it is the full body. Dragging the header moves
// it; the position is remembered per `id` so reopening puts it back where you
// left it rather than back where it was born.
//
// Not a modal, so **no global Esc handler**. Esc belongs to the page underneath,
// which still has selections to clear and menus to close while this is open.

/** Where each panel was last left, by id. Module-level so it survives unmount. */
const placed = new Map()

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi))

export default function FloatingPanel({
  id = 'panel',
  open,
  onClose,
  title,
  status,
  width = 620,
  maxHeight = '62vh',
  children,
}) {
  const remembered = placed.get(id)
  const [pos, setPos] = useState(remembered?.pos ?? null)
  const [minimised, setMinimised] = useState(remembered?.minimised ?? false)
  const frame = useRef(null)

  useEffect(() => { placed.set(id, { pos, minimised }) }, [id, pos, minimised])

  // Bottom-right by default — out of the way of a workbench that reads
  // left-to-right, and where a console belongs.
  const at = pos ?? defaultPos(width)

  const startDrag = useCallback((e) => {
    // Only the header itself, and not the buttons on it.
    if (e.target.closest('[data-no-drag]')) return
    const box = frame.current?.getBoundingClientRect()
    const from = { x: e.clientX, y: e.clientY, left: box?.left ?? at.left, top: box?.top ?? at.top }
    const h = box?.height ?? 48

    const move = (ev) => setPos({
      left: clamp(from.left + (ev.clientX - from.x), 8, window.innerWidth - width - 8),
      top: clamp(from.top + (ev.clientY - from.y), 8, window.innerHeight - Math.min(h, 120)),
    })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    e.preventDefault()
  }, [at.left, at.top, width])

  // A window that got smaller must not leave the panel off the edge, where it
  // cannot be dragged back.
  useEffect(() => {
    if (!open) return
    const onResize = () => setPos((p) => (p ? {
      left: clamp(p.left, 8, Math.max(8, window.innerWidth - width - 8)),
      top: clamp(p.top, 8, Math.max(8, window.innerHeight - 120)),
    } : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, width])

  if (!open) return null

  return (
    <div
      ref={frame}
      role="complementary"
      aria-label={title}
      style={{
        position: 'fixed',
        left: at.left,
        top: at.top,
        width,
        maxWidth: 'calc(100vw - 16px)',
        zIndex: Z.drawer,
        background: '#fff',
        border: '1px solid var(--me-grey-15)',
        borderRadius: 14,
        boxShadow: '0 14px 44px rgba(27,28,30,.20)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        onMouseDown={startDrag}
        onDoubleClick={() => setMinimised((m) => !m)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 10px 9px 14px',
          borderBottom: minimised ? 'none' : '1px solid var(--me-grey-15)',
          background: 'var(--me-grey-08)',
          cursor: 'move', userSelect: 'none', flexShrink: 0,
        }}
      >
        <Icon name="grip-horizontal" size={14} color="var(--me-grey-50)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)', flexShrink: 0 }}>{title}</span>
        {/* The status line is what makes minimising worth doing — collapsed, this
            is the entire panel, so it has to say the thing you are watching for. */}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--me-grey-70)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {status}
        </span>
        <HeaderButton
          title={minimised ? 'Expand' : 'Minimise'}
          onClick={() => setMinimised((m) => !m)}
          icon={minimised ? 'chevron-up' : 'chevron-down'}
        />
        <HeaderButton title="Close" onClick={onClose} icon="x" />
      </div>

      {/* Kept mounted while minimised so scroll position, and anything the body
          is subscribed to, survive being collapsed and reopened. */}
      <div style={{ display: minimised ? 'none' : 'block', maxHeight, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

function HeaderButton({ title, onClick, icon }) {
  return (
    <button
      data-no-drag
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        border: 'none', background: 'none', cursor: 'pointer', color: 'var(--me-grey-70)',
      }}
    >
      <Icon name={icon} size={16} color="currentColor" />
    </button>
  )
}

/** Bottom-right, with room to breathe. Server-rendered gets a sane constant. */
function defaultPos(width) {
  if (typeof window === 'undefined') return { left: 40, top: 40 }
  return {
    left: Math.max(8, window.innerWidth - width - 24),
    top: Math.max(8, window.innerHeight - Math.round(window.innerHeight * 0.62) - 32),
  }
}
