import { useRef } from 'react'

// Draggable divider for a two-pane split. Reports the new right-pane width in
// px. Ported from ui/src/components/stages/parse/ResizeHandle.jsx.
export default function ResizeHandle({ width, onResize, min = 280, max = 640 }) {
  const dragging = useRef(false)

  const start = (e) => {
    dragging.current = true
    const startX = e.clientX
    const startWidth = width

    const move = (ev) => {
      if (!dragging.current) return
      // Dragging left widens the right pane.
      const next = Math.min(max, Math.max(min, startWidth - (ev.clientX - startX)))
      onResize(next)
    }
    const up = () => {
      dragging.current = false
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

  return (
    <div
      onMouseDown={start}
      onDoubleClick={() => onResize(368)}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize · double-click to reset"
      style={{
        flex: '0 0 7px',
        cursor: 'col-resize',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ width: 1, height: '100%', background: 'var(--me-grey-15)' }} />
    </div>
  )
}
