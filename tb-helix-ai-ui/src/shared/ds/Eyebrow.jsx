// The micro-label above a value or a section: uppercase, tracked out, grey.
//
// It was written inline about thirty times across the two modules and had
// drifted to four letter-spacings and three sizes, so the same label read
// slightly differently on adjacent panels. One component, two sizes.
//
//   sm  10.5px — inside a card, a menu, a drawer section
//   md  11px   — above a panel or a column of facts
const SIZES = { sm: { fontSize: 10.5, letterSpacing: '0.07em' }, md: { fontSize: 11, letterSpacing: '0.08em' } }

export default function Eyebrow({ size = 'md', as: Tag = 'span', color = 'var(--me-grey-70)', children, style }) {
  const sz = SIZES[size] || SIZES.md
  return (
    <Tag style={{ ...sz, fontWeight: 700, textTransform: 'uppercase', color, margin: 0, ...style }}>
      {children}
    </Tag>
  )
}
