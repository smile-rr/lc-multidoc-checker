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

/** Where each panel was left and how big, by id. Module-level so it survives unmount. */
const placed = new Map()

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi))

const MIN_W = 360
const MIN_H = 160
/** Hit-strip thickness for edge/corner resize. Wide enough to grab, thin enough
 *  not to steal clicks from the body or the header buttons. */
const EDGE = 6
const CORNER = 14

/**
 * Resize directions. Each flag says which side moves; the opposite side stays
 * put. Left/top therefore also shift `pos`, so the panel grows toward the
 * cursor rather than sliding away under it.
 */
const DIRS = {
  n:  { cursor: 'ns-resize',   n: true },
  s:  { cursor: 'ns-resize',   s: true },
  e:  { cursor: 'ew-resize',   e: true },
  w:  { cursor: 'ew-resize',   w: true },
  ne: { cursor: 'nesw-resize', n: true, e: true },
  nw: { cursor: 'nwse-resize', n: true, w: true },
  se: { cursor: 'nwse-resize', s: true, e: true },
  sw: { cursor: 'nesw-resize', s: true, w: true },
}

export default function FloatingPanel({
  id = 'panel',
  open,
  onClose,
  title,
  status,
  width = 620,
  /** Body height in px — the header sits above it. Resizable from any edge or corner. */
  height = 520,
  /**
   * Where to appear when nothing has been dragged yet. Used by a panel that opens
   * from a toolbar button — first open sits under the button; after a drag, the
   * remembered place wins.
   */
  anchor = null,
  children,
}) {
  const remembered = placed.get(id)
  const [pos, setPos] = useState(remembered?.pos ?? null)
  // Clamped on the way in, not only on window resize: a panel asking for 620px
  // of body on a laptop in a video call is a panel whose bottom half, and its
  // resize grip with it, are off the screen.
  const [size, setSize] = useState(() => remembered?.size ?? {
    width,
    height: typeof window === 'undefined' ? height : clamp(height, MIN_H, Math.max(MIN_H, window.innerHeight - 150)),
  })
  const [minimised, setMinimised] = useState(remembered?.minimised ?? false)
  const frame = useRef(null)

  useEffect(() => { placed.set(id, { pos, size, minimised }) }, [id, pos, size, minimised])

  // Remembered drag first; then the caller's anchor (under a button); then the
  // bottom-right default the run log uses.
  const at = pos ?? (anchor ? clampPos(anchor, size.width) : defaultPos(size.width, size.height))

  const startDrag = useCallback((e) => {
    // Only the header itself, and not the buttons on it.
    if (e.target.closest('[data-no-drag]')) return
    const box = frame.current?.getBoundingClientRect()
    const from = { x: e.clientX, y: e.clientY, left: box?.left ?? at.left, top: box?.top ?? at.top }
    const h = box?.height ?? 48

    const move = (ev) => setPos({
      left: clamp(from.left + (ev.clientX - from.x), 8, window.innerWidth - size.width - 8),
      top: clamp(from.top + (ev.clientY - from.y), 8, window.innerHeight - Math.min(h, 120)),
    })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    e.preventDefault()
  }, [at.left, at.top, size.width])

  // Resize from any edge or corner. The direction decides which sides move;
  // the opposite sides stay fixed so the content you are reading does not jump.
  const startResize = useCallback((dirKey) => (e) => {
    const dir = DIRS[dirKey]
    if (!dir) return
    const box = frame.current?.getBoundingClientRect()
    const left0 = box?.left ?? at.left
    const top0 = box?.top ?? at.top
    const from = { x: e.clientX, y: e.clientY, w: size.width, h: size.height, left: left0, top: top0 }

    const move = (ev) => {
      const dx = ev.clientX - from.x
      const dy = ev.clientY - from.y
      let nextW = from.w
      let nextH = from.h
      let nextL = from.left
      let nextT = from.top

      if (dir.e) {
        nextW = clamp(from.w + dx, MIN_W, window.innerWidth - from.left - 8)
      } else if (dir.w) {
        // Grow leftward: shrink width as the pointer moves right, and keep the
        // right edge where it was by shifting `left` by the same delta.
        const maxW = from.left + from.w - 8
        nextW = clamp(from.w - dx, MIN_W, maxW)
        nextL = from.left + (from.w - nextW)
      }

      if (dir.s) {
        nextH = clamp(from.h + dy, MIN_H, window.innerHeight - from.top - 64)
      } else if (dir.n) {
        const maxH = from.top + from.h - 8
        nextH = clamp(from.h - dy, MIN_H, maxH)
        nextT = from.top + (from.h - nextH)
      }

      setSize({ width: nextW, height: nextH })
      if (dir.w || dir.n) setPos({ left: nextL, top: nextT })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = dir.cursor
    document.body.style.userSelect = 'none'
    e.preventDefault()
    e.stopPropagation()
  }, [at.left, at.top, size.width, size.height])

  // A window that got smaller must not leave the panel off the edge, where it
  // cannot be dragged back — or taller than the window it is in.
  useEffect(() => {
    if (!open) return
    const onWindowResize = () => {
      setSize((s) => ({
        width: clamp(s.width, MIN_W, Math.max(MIN_W, window.innerWidth - 16)),
        height: clamp(s.height, MIN_H, Math.max(MIN_H, window.innerHeight - 120)),
      }))
      setPos((p) => (p ? {
        left: clamp(p.left, 8, Math.max(8, window.innerWidth - MIN_W - 8)),
        top: clamp(p.top, 8, Math.max(8, window.innerHeight - 120)),
      } : p))
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [open])

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
        width: size.width,
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
          // Window chrome, not a section heading. It shared a grey with the section
          // headers inside the body, so the panel's own title bar and the first
          // heading under it read as two of the same thing — and the boundary
          // between "this window" and "what is in it" disappeared.
          background: 'var(--me-ink)',
          cursor: 'move', userSelect: 'none', flexShrink: 0,
        }}
      >
        <Icon name="grip-horizontal" size={14} color="rgba(255,255,255,.45)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0 }}>{title}</span>
        {/* The status line is what makes minimising worth doing — collapsed, this
            is the entire panel, so it has to say the thing you are watching for. */}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'rgba(255,255,255,.66)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          is subscribed to, survive being collapsed and reopened.
          A fixed height rather than a max: the panel is a window onto a list that
          grows while you watch it, and one that resized itself every time an event
          arrived would move under the cursor. */}
      <div style={{ display: minimised ? 'none' : 'block', height: size.height, overflow: 'auto', minHeight: 0 }}>
        {children}
      </div>

      {!minimised && (
        <>
          {/* Invisible edge/corner hit strips — same idea as a desktop window.
              Edges are the everyday path; corners keep the diagonal habit. The
              visible SE grip below stays so resize is still discoverable. */}
          <ResizeStrip dir="n"  onMouseDown={startResize('n')}  style={{ top: 0, left: CORNER, right: CORNER, height: EDGE }} />
          <ResizeStrip dir="s"  onMouseDown={startResize('s')}  style={{ bottom: 0, left: CORNER, right: CORNER, height: EDGE }} />
          <ResizeStrip dir="e"  onMouseDown={startResize('e')}  style={{ right: 0, top: CORNER, bottom: CORNER, width: EDGE }} />
          <ResizeStrip dir="w"  onMouseDown={startResize('w')}  style={{ left: 0, top: CORNER, bottom: CORNER, width: EDGE }} />
          <ResizeStrip dir="ne" onMouseDown={startResize('ne')} style={{ top: 0, right: 0, width: CORNER, height: CORNER }} />
          <ResizeStrip dir="nw" onMouseDown={startResize('nw')} style={{ top: 0, left: 0, width: CORNER, height: CORNER }} />
          <ResizeStrip dir="sw" onMouseDown={startResize('sw')} style={{ bottom: 0, left: 0, width: CORNER, height: CORNER }} />
          <ResizeStrip dir="se" onMouseDown={startResize('se')} style={{ bottom: 0, right: 0, width: CORNER, height: CORNER }} />
          <div
            data-no-drag
            onMouseDown={startResize('se')}
            role="separator"
            aria-label="Resize"
            title="Drag to resize"
            style={{
              position: 'absolute', right: 0, bottom: 0, width: 18, height: 18,
              cursor: 'nwse-resize', zIndex: 2,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: 3, color: 'var(--me-grey-50)',
            }}
          >
            {/* Two strokes in the corner — the convention, and the only thing at this
                size that reads as a grip rather than as an artefact. */}
            <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden="true">
              <path d="M10 4 L4 10 M10 8 L8 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
}

/** Invisible hit target for one resize direction. */
function ResizeStrip({ dir, onMouseDown, style }) {
  return (
    <div
      data-no-drag
      onMouseDown={onMouseDown}
      role="separator"
      aria-label={`Resize ${dir}`}
      style={{
        position: 'absolute',
        cursor: DIRS[dir].cursor,
        zIndex: 2,
        ...style,
      }}
    />
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
        border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.72)',
      }}
    >
      <Icon name={icon} size={16} color="currentColor" />
    </button>
  )
}

/**
 * Bottom-right, with room to breathe, and high enough up that the whole body
 * fits on screen rather than running off the bottom. Server-rendered gets a
 * sane constant.
 */
function defaultPos(width, height) {
  if (typeof window === 'undefined') return { left: 40, top: 40 }
  const HEADER = 44
  return {
    left: Math.max(8, window.innerWidth - width - 24),
    top: clamp(window.innerHeight - height - HEADER - 24, 8, Math.max(8, window.innerHeight - 120)),
  }
}

/** Keep an anchored panel on screen — under a toolbar button that may sit near
 *  the right edge. */
function clampPos(anchor, width) {
  if (typeof window === 'undefined') return anchor
  return {
    left: clamp(anchor.left, 8, Math.max(8, window.innerWidth - width - 8)),
    top: clamp(anchor.top, 8, Math.max(8, window.innerHeight - 120)),
  }
}
