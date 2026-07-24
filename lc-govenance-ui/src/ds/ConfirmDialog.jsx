import Button from './Button'
import { Overlay, sheet } from '../modals/Overlay'

// Reusable confirmation for destructive/irreversible actions. Driven by the
// store's `confirm` object: { title, message, confirmLabel, onCancel, onConfirm }.
export default function ConfirmDialog({ confirm }) {
  if (!confirm) return null
  return (
    <Overlay onClose={confirm.onCancel} align="center" pad="24px">
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 420 }}>
        <div style={{ padding: '22px 24px 18px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>{confirm.title}</h2>
          {confirm.message ? <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--me-grey)', margin: 0 }}>{confirm.message}</p> : null}
        </div>
        <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" size="md" onClick={confirm.onCancel}>Cancel</Button>
          <Button variant="danger" size="md" onClick={confirm.onConfirm}>{confirm.confirmLabel || 'Delete'}</Button>
        </div>
      </div>
    </Overlay>
  )
}
