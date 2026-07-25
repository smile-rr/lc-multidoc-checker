import Button from './Button'
import { Overlay, sheet } from './Overlay'

// Reusable confirmation for destructive/irreversible actions. Driven by the
// store's `confirm` object: { title, message, confirmLabel, onCancel, onConfirm }.
//
// `blocked: true` turns it into a refusal rather than a question: the action is
// not offered at all, because the system knows it would break a reference
// something else depends on. That is a different dialog from "are you sure", and
// it should look different — there is no destructive button to press. Where a
// safe alternative exists, pass `acknowledgeLabel` and `onConfirm` to offer it.
export default function ConfirmDialog({ confirm }) {
  if (!confirm) return null
  const blocked = !!confirm.blocked

  return (
    <Overlay onClose={confirm.onCancel} align="center" pad="24px">
      <div onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: blocked ? 460 : 420 }}>
        <div style={{ padding: '22px 24px 18px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px' }}>{confirm.title}</h2>
          {confirm.message ? <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--me-grey)', margin: 0 }}>{confirm.message}</p> : null}
        </div>
        <div style={{ padding: '0 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {blocked ? (
            <>
              <Button variant="ghost" size="md" onClick={confirm.onCancel}>Close</Button>
              {confirm.onConfirm && confirm.acknowledgeLabel ? (
                <Button variant="primary" size="md" onClick={confirm.onConfirm}>{confirm.acknowledgeLabel}</Button>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={confirm.onCancel}>Cancel</Button>
              <Button variant="danger" size="md" onClick={confirm.onConfirm}>{confirm.confirmLabel || 'Delete'}</Button>
            </>
          )}
        </div>
      </div>
    </Overlay>
  )
}
