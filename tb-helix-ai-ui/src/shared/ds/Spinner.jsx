// Inline "this is running" ring. Sized to sit in a list row next to a 14–16px
// status icon without shifting the row height.
export default function Spinner({ size = 12 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: '2px solid var(--me-blue-20)',
        borderTopColor: 'var(--me-blue)',
        animation: 'helix-spin 800ms linear infinite',
        display: 'block',
      }}
    />
  )
}
