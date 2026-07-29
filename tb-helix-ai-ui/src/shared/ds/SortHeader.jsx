import Icon from './Icon'

// A sortable column heading.
//
// Only the active column shows a caret. An idle column with a faint up-down
// arrow claims every heading is doing something, and in a five-column table
// that is five pieces of chrome to say "you could click me" — the pointer
// already says that. So: caret on the one that is sorting, nothing on the rest.
//
// Drop into a `listHead` grid in place of the plain <span>.
export default function SortHeader({ label, active, dir = 'asc', onSort, align = 'left' }) {
  return (
    <button
      type="button"
      onClick={onSort}
      title={active ? `Sorted by ${label.toLowerCase()} — click to reverse` : `Sort by ${label.toLowerCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        font: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: active ? 'var(--me-ink)' : 'inherit',
      }}
    >
      {label}
      {active && <Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color="var(--me-blue)" />}
    </button>
  )
}
