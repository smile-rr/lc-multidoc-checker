import { useState } from 'react'

// Pill button — Memara core. variant: primary | secondary | ghost. size: md | sm.
const SIZES = {
  md: { height: 44, padding: '0 20px', fontSize: 14 },
  sm: { height: 36, padding: '0 14px', fontSize: 13 },
}

const VARIANTS = {
  primary: {
    base: { background: 'var(--me-blue)', color: '#fff', border: '1px solid var(--me-blue)' },
    hover: { background: 'var(--me-blue-deep)', borderColor: 'var(--me-blue-deep)' },
  },
  secondary: {
    base: { background: '#fff', color: 'var(--me-blue)', border: '1px solid var(--me-blue)' },
    hover: { background: 'var(--me-blue-20)' },
  },
  ghost: {
    base: { background: 'transparent', color: 'var(--me-grey)', border: '1px solid transparent' },
    hover: { background: 'var(--me-grey-08)' },
  },
  danger: {
    base: { background: 'var(--status-error)', color: '#fff', border: '1px solid var(--status-error)' },
    hover: { background: '#b01a15', borderColor: '#b01a15' },
  },
}

export default function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled,
  children,
  style,
  type = 'button',
}) {
  const [hover, setHover] = useState(false)
  const sz = SIZES[size] || SIZES.md
  const v = VARIANTS[variant] || VARIANTS.primary
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: sz.height,
        padding: sz.padding,
        borderRadius: 999,
        fontSize: sz.fontSize,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'background .15s var(--ease-standard), border-color .15s var(--ease-standard)',
        ...v.base,
        ...(hover && !disabled ? v.hover : null),
        ...style,
      }}
    >
      {children}
    </button>
  )
}
