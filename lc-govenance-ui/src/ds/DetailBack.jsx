import Icon from './Icon'

// Minimal "back to the list" link, sat at the top of a detail card. Deliberately
// plain — no page title / breadcrumb / eyebrow chrome.
export default function DetailBack({ label, onBack }) {
  return (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 2px', margin: '18px 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--me-grey)' }}>
      <Icon name="arrow-left" size={16} />
      {label}
    </button>
  )
}
