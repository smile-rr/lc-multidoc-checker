import { useEffect } from 'react'
import { Z } from './z'
import Icon from './Icon'

// Right-hand slide-over. Blocks the page behind a scrim; Esc and a click on the
// scrim both close it. Used for contextual side panels (Ask, run cost) that are
// too big for a popover but must not take the user off the screen they're on.
// `footer` pins a band to the base of the panel, outside the scrolling body — for
// content that is not part of what the drawer is scrolling through. The run-cost
// drawer uses it for the model price table: the body is one case, the footer is a
// standing system parameter, and a reader checking a figure should not have to
// scroll past the case to reach the rate that priced it.
export default function Drawer({ open, onClose, title, subtitle, width = 440, headerExtra, footer, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(27,28,30,.26)', zIndex: Z.modal, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1 }} />
      <div style={{ width, maxWidth: '100vw', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(27,28,30,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '18px 20px', borderBottom: '1px solid var(--me-grey-15)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--me-ink)' }}>{title}</span>
            {subtitle ? <span style={{ fontSize: 12.5, color: 'var(--me-grey-70)' }}>{subtitle}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {headerExtra}
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-70)', display: 'flex', padding: 0 }}>
              <Icon name="x" size={19} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
        {footer ? <div style={{ flexShrink: 0 }}>{footer}</div> : null}
      </div>
    </div>
  )
}
