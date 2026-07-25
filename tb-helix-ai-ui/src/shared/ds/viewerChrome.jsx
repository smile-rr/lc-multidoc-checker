import { useState, useRef, useLayoutEffect, useCallback } from 'react'

// Chrome shared by every document viewer.
//
// The credit is text and the presentation is a scan, so they render through
// different components — but a reader should not be able to tell that from the
// frame. Previously the text viewer was a fixed 620px card floating in grey space
// while the PDF filled its pane, which read as an overlay rather than a document.
// Both now measure the same container, subtract the same gutter and draw the same
// page, so switching between them changes the content and nothing else.

export const VIEWER_GUTTER = 48
export const FALLBACK_WIDTH = 560

// Height of the sticky toolbar. Scroll targets subtract it so a page lands with
// its top edge visible rather than tucked underneath.
export const TOOLBAR_HEIGHT = 38

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 0.25

/** Width a page should render at to fit `ref`'s scroll container, times zoom. */
export function useFitWidth(ref, { gutter = VIEWER_GUTTER, fallback = FALLBACK_WIDTH } = {}) {
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(240, el.clientWidth - gutter))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, gutter])
  return width
}

export function useZoom() {
  const [zoom, setZoom] = useState(1)
  const out = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))), [])
  const inn = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))), [])
  const reset = useCallback(() => setZoom(1), [])
  return { zoom, zoomOut: out, zoomIn: inn, reset }
}

/** The sticky bar above the pages. `left`/`right` are free for per-viewer bits. */
export function ViewerToolbar({ zoom, zoomOut, zoomIn, reset, left, right }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'rgba(255,255,255,.95)',
        backdropFilter: 'blur(4px)',
        borderBottom: '1px solid var(--me-grey-15)',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <ToolBtn onClick={zoomOut} disabled={zoom <= ZOOM_MIN} label="Zoom out">−</ToolBtn>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, width: 46, textAlign: 'center', color: 'var(--me-grey)', userSelect: 'none' }}>
        {Math.round(zoom * 100)}%
      </span>
      <ToolBtn onClick={zoomIn} disabled={zoom >= ZOOM_MAX} label="Zoom in">+</ToolBtn>
      <ToolBtn onClick={reset} disabled={zoom === 1} label="Reset zoom">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>100%</span>
      </ToolBtn>
      {left ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>{left}</span> : null}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>
        {right}
      </span>
    </div>
  )
}

/** The scroll container pages live in. */
export function ViewerScroll({ scrollRef, height = '100%', children }) {
  return (
    <div ref={scrollRef} style={{ background: 'var(--me-grey-08)', overflow: 'auto', height }}>
      {children}
    </div>
  )
}

/** The column pages stack in. */
export function PageColumn({ children }) {
  return (
    <div style={{ padding: '18px 0 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      {children}
    </div>
  )
}

/**
 * One page: a white sheet at `width`, with the caption beneath it that the PDF
 * viewer puts under every page. `minHeight` defaults to A4-ish so a short text
 * document still reads as a page rather than a strip.
 */
export function PageSheet({ width, minHeight, caption, padding = '40px 42px', children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          width,
          minHeight: minHeight ?? Math.round(width * 1.294),
          background: '#fff',
          border: '1px solid var(--me-grey-15)',
          boxShadow: '0 2px 10px rgba(27,28,30,.07)',
          padding,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
      {caption ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--me-grey-50)' }}>{caption}</span>
      ) : null}
    </div>
  )
}

export function PageSkeleton({ width }) {
  // 8.5 × 11 letter ratio — close enough for a placeholder.
  return (
    <div
      aria-label="Loading page"
      style={{ width, height: Math.round(width * 1.294), background: '#fff', border: '1px solid var(--me-grey-15)', boxShadow: '0 2px 10px rgba(27,28,30,.07)' }}
    />
  )
}

/**
 * Type a page number and go. Present because a 40-page bundle makes both the
 * chips and the arrows slow, and an examiner usually knows the page they want —
 * it is written on the finding they are chasing.
 */
export function PageJump({ page, total, onGo }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const n = Number(draft)
    if (Number.isInteger(n) && n >= 1 && n <= total) onGo(n)
    setDraft('')
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        onBlur={commit}
        placeholder={String(page)}
        aria-label={`Go to page, 1 to ${total}`}
        title={`Go to page (1–${total})`}
        style={{
          width: 40,
          height: 24,
          border: '1px solid var(--me-grey-20)',
          borderRadius: 6,
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--me-ink)',
          outline: 'none',
          background: '#fff',
        }}
      />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>/ {total}</span>
    </span>
  )
}

export function ToolBtn({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        minWidth: 24,
        height: 24,
        padding: '0 6px',
        borderRadius: 6,
        border: '1px solid var(--me-grey-20)',
        background: '#fff',
        color: 'var(--me-ink)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
      }}
    >
      {children}
    </button>
  )
}

export { useRef }
