import { useEffect } from 'react'
import { Z } from './z'
import Icon from './Icon'

// Centred blocking dialog. `footer` is an optional bar pinned under the body so
// the primary action keeps a fixed position however tall the content grows.
export default function Modal({ open, onClose, title, subtitle, width = 520, footer, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(27,28,30,.36)', zIndex: Z.modal, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(27,28,30,.28)', overflow: 'hidden' }}
      >
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--me-ink)' }}>{title}</span>
            {subtitle ? <span style={{ fontSize: 12.5, color: 'var(--me-grey-70)' }}>{subtitle}</span> : null}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--me-grey-70)', display: 'flex', padding: 0 }}>
            <Icon name="x" size={19} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 22px' }}>{children}</div>
        {footer ? (
          <div style={{ padding: '16px 22px 20px', borderTop: '1px solid var(--me-grey-15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexShrink: 0 }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
