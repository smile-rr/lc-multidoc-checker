import Icon from './Icon'

// One compact button that flips between list and card views. It shows the view
// you'll switch TO (grid + "Cards" while in list), so it reads as an action.
export default function ViewSwitch({ isList, onList, onCards }) {
  const target = isList
    ? { icon: 'layout-grid', label: 'Cards', onClick: onCards }
    : { icon: 'list', label: 'List', onClick: onList }
  return (
    <button
      onClick={target.onClick}
      title={`Switch to ${target.label.toLowerCase()} view`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', border: '1px solid var(--me-grey-20)', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--me-grey)' }}
    >
      <Icon name={target.icon} size={16} color="currentColor" />
      {target.label}
    </button>
  )
}
