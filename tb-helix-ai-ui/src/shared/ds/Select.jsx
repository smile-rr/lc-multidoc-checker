// The one native select.
//
// Native is right for a short, fixed list — it gets keyboard, typeahead and the
// platform's own popup for free, which no custom menu matches. Menu.jsx covers
// the other case: picking from a list the data supplies. What was drifting was
// the *styling*, so all of it lives here.
//
// options: [{ label, value }] — or groups: [{ label, options: [...] }] for a
// list long enough to need dividing up.
const SIZES = {
  md: { height: 46, padding: '0 14px', fontSize: 14, radius: 8 },
  sm: { height: 28, padding: '0 6px', fontSize: 12, radius: 6 },
}

export default function Select({
  label,
  options = [],
  groups,
  value,
  onChange,
  onFocus,
  size = 'md',
  title,
  color = 'var(--me-ink)',
  style,
}) {
  const sz = SIZES[size] || SIZES.md
  const opt = (o) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {label ? <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--me-grey)' }}>{label}</label> : null}
      <select
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        title={title}
        style={{
          width: label ? '100%' : undefined,
          height: sz.height,
          border: '1px solid var(--me-grey-20)',
          borderRadius: sz.radius,
          padding: sz.padding,
          fontFamily: 'inherit',
          fontSize: sz.fontSize,
          fontWeight: size === 'sm' ? 600 : 400,
          color,
          background: '#fff',
          cursor: 'pointer',
          outline: 'none',
          ...style,
        }}
      >
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map(opt)}
              </optgroup>
            ))
          : options.map(opt)}
      </select>
    </div>
  )
}
