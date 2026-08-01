import { useRef, useState } from 'react'

// Draggable divider for a two-pane split. Ported from
// ui/src/components/stages/parse/ResizeHandle.jsx.
//
// `side` says which pane is the fixed one, because the two cases are not symmetrical
// and choosing wrong is invisible until somebody resizes the window:
//
//   'right'  the right pane holds the width, the left one flexes. For a split whose
//            left side is the subject — the credit beside a page viewer.
//   'left'   the left pane holds the width, the right one flexes. For a rail beside a
//            detail pane, where a wider window has to widen what you are reading
//            rather than the list you navigate with.
//
// Defaults to 'right', which is what the first caller needed.
export default function ResizeHandle({ width, onResize, min = 280, max = 640, side = 'right', reset = 368 }) {
  const dragging = useRef(false)
  // Hover, focus and drag all light the rule. A one-pixel line with no feedback is
  // not an affordance — nobody finds it, and a pane that could be resized reads as
  // fixed. Lighting it on approach is the whole disclosure and it costs no space.
  const [warm, setWarm] = useState(false)

  const start = (e) => {
    dragging.current = true
    const startX = e.clientX
    const startWidth = width

    const move = (ev) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX
      // Dragging toward the fixed pane shrinks it, whichever side it sits on.
      const raw = side === 'right' ? startWidth - delta : startWidth + delta
      onResize(Math.min(max, Math.max(min, raw)))
    }
    const up = () => {
      dragging.current = false
      setWarm(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  // A divider that can only be dragged is one some people cannot move at all.
  // Arrows nudge, shift nudges further, Home resets — what a native splitter answers to.
  const key = (e) => {
    const step = e.shiftKey ? 48 : 12
    const at = (next) => { onResize(Math.min(max, Math.max(min, next))); e.preventDefault() }
    if (e.key === 'ArrowLeft') at(side === 'right' ? width + step : width - step)
    else if (e.key === 'ArrowRight') at(side === 'right' ? width - step : width + step)
    else if (e.key === 'Home') at(reset)
  }

  return (
    <div
      onMouseDown={start}
      onDoubleClick={() => onResize(reset)}
      onMouseEnter={() => setWarm(true)}
      onMouseLeave={() => { if (!dragging.current) setWarm(false) }}
      onFocus={() => setWarm(true)}
      onBlur={() => setWarm(false)}
      onKeyDown={key}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      style={{
        flex: '0 0 9px',
        cursor: 'col-resize',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
      }}
    >
      <span
        style={{
          // The line never widens. A divider that thickens under the cursor shifts
          // both panes by a pixel as you approach, which reads as the layout
          // twitching; the colour carries the whole message on its own.
          width: 1,
          height: '100%',
          background: warm ? 'var(--me-blue)' : 'var(--me-grey-15)',
          transition: 'background var(--dur-fast) var(--ease-standard)',
        }}
      />
    </div>
  )
}
