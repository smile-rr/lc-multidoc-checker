import { Z } from './z'

// A section's toolbar: left slot (meta / tabs / search), right slot (actions,
// view switch). Sticky by default so it stays put under the nav while the
// content below scrolls. Pass sticky={false} to opt out.
export default function Toolbar({ left, right, style, sticky = true }) {
  const stickyStyle = sticky
    ? { position: 'sticky', top: 'var(--nav-h, 56px)', zIndex: Z.toolbar, background: 'var(--me-grey-08)', paddingTop: 14, paddingBottom: 12, marginBottom: 6 }
    : { marginBottom: 16 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...stickyStyle, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>{left}</div>
      {right ? <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>{right}</div> : null}
    </div>
  )
}
