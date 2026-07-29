// The white surface everything sits on: a check, a field, an agent, a panel.
//
// One border colour, one shadow, two radii. It was written out at four
// different shadows and three radii across the modules, which made adjacent
// panels look like they belonged to different products.
const PADS = { none: 0, sm: '14px 16px', md: '18px 20px', lg: '20px 22px' }

/** The surface as a style object, for the cases a `<Card>` element can't cover:
 *  a <button> that is a card, or a panel that adds its own layout on top. */
export const cardSurface = (radius = 12) => ({
  background: '#fff',
  border: '1px solid var(--me-grey-15)',
  borderRadius: radius,
  boxShadow: 'var(--shadow-sm)',
})

export default function Card({ pad = 'md', radius = 12, flush = false, children, style, ...rest }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--me-grey-15)',
        borderRadius: radius,
        boxShadow: 'var(--shadow-sm)',
        padding: PADS[pad] ?? pad,
        overflow: flush ? 'hidden' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
