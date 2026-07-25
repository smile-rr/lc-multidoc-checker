import { Z } from './z'

// Transient confirmation pill, centred at the foot of the viewport. Purely
// presentational — owners hold the message and clear it on a timer.
export default function Toast({ message }) {
  if (!message) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--me-ink)',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: 999,
        fontSize: 13.5,
        boxShadow: '0 8px 28px rgba(27,28,30,.28)',
        zIndex: Z.modal + 10,
        animation: 'helix-in 200ms var(--ease-standard)',
      }}
    >
      {message}
    </div>
  )
}
