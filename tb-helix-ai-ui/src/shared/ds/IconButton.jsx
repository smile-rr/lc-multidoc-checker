import { useState } from 'react'
import Icon from './Icon'

// A square button that is only an icon: remove, close, expand, reorder.
//
// Always has a `title` — an icon with no name is a guess, and these sit next to
// destructive actions. `tone="danger"` turns it red on hover only, so a row of
// them doesn't read as a row of warnings.
const SIZES = { sm: { box: 24, icon: 13, radius: 6 }, md: { box: 28, icon: 15, radius: 7 }, lg: { box: 30, icon: 18, radius: 7 } }

export default function IconButton({ icon, title, onClick, size = 'md', tone, disabled, color = 'var(--me-grey-50)', style }) {
  const [hover, setHover] = useState(false)
  const sz = SIZES[size] || SIZES.md
  const danger = tone === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: sz.box,
        height: sz.box,
        flexShrink: 0,
        borderRadius: sz.radius,
        border: 'none',
        background: hover && !disabled ? 'var(--me-grey-08)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: hover && danger && !disabled ? 'var(--status-error)' : color,
        transition: 'background .12s var(--ease-standard), color .12s var(--ease-standard)',
        ...style,
      }}
    >
      <Icon name={icon} size={sz.icon} color="currentColor" />
    </button>
  )
}
