// Standard page container.
//
// The tier belongs to the *product surface*, not to the screen: every section
// under one tab bar shares a measure, so switching tabs never shifts the frame.
// Where a single card has no use for the full width, the page keeps the tier and
// the card caps itself — the frame stays put, the content decides its measure.
//
//   detail → 1240  all four governance surfaces, and their detail pages
//   list   → 1120  lc-check's own lists
//   narrow → 960   reading columns / forms
const MAX = { list: 1120, detail: 1240, narrow: 960 }

export default function Page({ width = 'list', children, style }) {
  return (
    <div style={{ maxWidth: MAX[width] || MAX.list, margin: '0 auto', padding: '0 32px 72px', ...style }}>
      {children}
    </div>
  )
}
