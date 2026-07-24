import { useEffect } from 'react'
import { Z } from '../ds/z'

// Shared modal overlay + sheet styling. Closes on backdrop click and on Esc.
export function Overlay({ onClose, children, align = 'flex-start', pad = '64px 20px' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(27,28,30,.5)', zIndex: Z.modal, display: 'flex', alignItems: align, justifyContent: 'center', padding: pad, overflow: 'auto' }}
    >
      {children}
    </div>
  )
}

export const sheet = {
  width: '100%',
  background: '#fff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 24px 60px rgba(27,28,30,.35)',
}
