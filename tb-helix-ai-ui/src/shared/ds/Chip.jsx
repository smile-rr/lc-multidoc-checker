import Icon from './Icon'

// A data tag: a field name, a document type, a filter, a count.
//
// Not to be confused with Badge, which is the uppercase *status* pill — one
// per row, saying what state a thing is in. A Chip is lowercase and there are
// usually several: it labels data rather than status.
//
// `onRemove` builds in the × so every removable chip has the same hit area,
// and `dashed` is the "+ add one" affordance that sits at the end of a row of
// them — same size and rhythm as the chips it adds to.
const TONES = {
  neutral: { background: 'var(--me-grey-08)', color: 'var(--me-grey)', border: 'var(--me-grey-15)' },
  blue: { background: 'var(--me-blue-20)', color: 'var(--me-blue-deep)', border: 'transparent' },
  green: { background: 'var(--me-green-20)', color: '#1F7A00', border: 'transparent' },
  warning: { background: '#FBEFCF', color: '#946400', border: 'transparent' },
  error: { background: '#FBE3E1', color: 'var(--status-error)', border: 'transparent' },
  plain: { background: 'transparent', color: 'var(--me-grey-70)', border: 'var(--me-grey-20)' },
}
// Removable chips lose a little right padding so the × sits at the same optical
// distance from the edge as the text does on a plain one.
const SIZES = {
  sm: { fontSize: 11, padY: 2, padX: 8, gap: 4 },
  md: { fontSize: 11.5, padY: 3, padX: 10, gap: 5 },
}

export default function Chip({
  tone = 'neutral',
  size = 'md',
  mono,
  dashed,
  pill = true,
  onRemove,
  onClick,
  title,
  children,
  style,
}) {
  const t = TONES[tone] || TONES.neutral
  const sz = SIZES[size] || SIZES.md
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sz.gap,
        maxWidth: '100%',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontSize: sz.fontSize,
        fontWeight: 500,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        borderRadius: pill ? 999 : 6,
        padding: `${sz.padY}px ${onRemove ? sz.padX - 4 : sz.padX}px ${sz.padY}px ${sz.padX}px`,
        background: t.background,
        color: t.color,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${dashed ? 'var(--me-grey-20)' : t.border}`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(e) }}
          title="Remove"
          aria-label="Remove"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'currentColor', opacity: 0.65, display: 'flex', padding: 0, flexShrink: 0 }}
        >
          <Icon name="x" size={size === 'sm' ? 10 : 11} color="currentColor" />
        </button>
      )}
    </Tag>
  )
}
