import Eyebrow from '@shared/ds/Eyebrow'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '@shared/ds/Icon'
import HelixMark from '@shared/ds/HelixMark'
import { usePersistedState } from '@shared/lib/usePersistedState'
import { MODULES, moduleForPath } from './moduleRegistry'

// The platform rail. Level 1 is the module; level 2 is that module's own
// entry points. The rail knows nothing about what a module does — it renders
// whatever `navItems` the descriptor declares and lights up whichever one the
// module's `matchNav` claims for the current URL.
//
// It collapses to a strip of icons. A workbench screen is wide — a bundle
// viewer beside a findings list — and 236px of rail is 236px that page does not
// get. Collapsed, the rail still says which module you are in and still lets
// you switch; what it gives up is the second level, which is reachable in one
// more click from the module's own page. The choice persists, because a rail
// that re-expands on every reload is not a choice.
const WIDE = 236
const NARROW = 64

export default function SideNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const active = moduleForPath(location.pathname)
  const [collapsed, setCollapsed] = usePersistedState('nav.collapsed', false)

  // Modules stay expanded once opened, so switching back doesn't re-collapse.
  const [manual, setManual] = useState({})
  const isOpen = (m) => manual[m.id] ?? m.id === active?.id

  return (
    <aside
      style={{
        width: collapsed ? NARROW : WIDE,
        flex: `0 0 ${collapsed ? NARROW : WIDE}px`,
        background: '#fff',
        borderRight: '1px solid var(--me-grey-15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        padding: collapsed ? '20px 10px' : '20px 14px',
        position: 'sticky',
        top: 0,
        height: '100vh',
        transition: 'width 160ms var(--ease-standard), flex-basis 160ms var(--ease-standard)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? 0 : '0 8px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        {/* The mark, from the same geometry as the favicon. Rungs off at this
            size — three extra strokes at 22px read as noise. */}
        <HelixMark size={22} showRungs={false} />
        {!collapsed && (
          <>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--me-ink)' }}>Helix<span style={{ color: 'var(--me-blue)' }}> AI</span></span>
            <Eyebrow style={{ fontWeight: 500 }}>Trade</Eyebrow>
          </>
        )}
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {MODULES.map((m) => {
          const on = m.id === active?.id
          const activeItem = on ? m.matchNav?.(location.pathname) : null

          // Collapsed, or a module with a single entry point: one row — no
          // disclosure, no child that repeats its parent's name.
          if (collapsed || m.navItems.length <= 1) {
            return (
              <ModuleRow
                key={m.id}
                label={m.label}
                icon={m.icon}
                on={on}
                collapsed={collapsed}
                expandable={false}
                onClick={() => navigate(m.navItems[0].path)}
              />
            )
          }

          const open = isOpen(m)
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ModuleRow
                label={m.label}
                icon={m.icon}
                on={on}
                expandable
                open={open}
                onClick={() => {
                  setManual((s) => ({ ...s, [m.id]: true }))
                  if (!on) navigate(m.navItems[0].path)
                  else setManual((s) => ({ ...s, [m.id]: !open }))
                }}
              />
              {open
                ? m.navItems.map((it) => (
                    <ChildRow
                      key={it.id}
                      label={it.label}
                      icon={it.icon}
                      on={it.id === activeItem}
                      onClick={() => navigate(it.path)}
                    />
                  ))
                : null}
            </div>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--me-grey-08)' }}>
        <CollapseToggle collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
      </div>
    </aside>
  )
}

// Bottom of the rail, where it is out of the way of the navigation above it.
// Chevrons point the way the rail will move, so the control shows its outcome
// rather than its current state.
function CollapseToggle({ collapsed, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
      aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
      aria-expanded={!collapsed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 9,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12.5,
        color: 'var(--me-grey-70)',
        background: hover ? 'var(--me-grey-08)' : 'transparent',
        transition: 'background 160ms var(--ease-standard)',
      }}
    >
      <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} size={16} color="var(--me-grey-50)" />
      {!collapsed && <span>Collapse</span>}
    </button>
  )
}

function ModuleRow({ label, icon, on, open, expandable = true, collapsed = false, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10,
        width: '100%',
        padding: collapsed ? '10px 0' : '9px 10px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 13.5,
        fontWeight: on ? 600 : 400,
        color: on ? 'var(--me-blue-deep)' : 'var(--me-grey)',
        background: on ? 'var(--me-blue-20)' : hover ? 'var(--me-grey-08)' : 'transparent',
        transition: 'background 160ms var(--ease-standard)',
      }}
    >
      <Icon name={icon} size={17} color={on ? 'var(--me-blue)' : 'var(--me-grey-70)'} />
      {!collapsed && <span style={{ flex: 1, minWidth: 0 }}>{label}</span>}
      {!collapsed && expandable ? <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} color="var(--me-grey-50)" /> : null}
    </button>
  )
}

function ChildRow({ label, icon, on, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '7px 10px 7px 22px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 13,
        fontWeight: on ? 600 : 400,
        color: on ? 'var(--me-ink)' : 'var(--me-grey-70)',
        background: on ? 'var(--me-grey-08)' : hover ? 'var(--me-grey-08)' : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon name={icon} size={15} color={on ? 'var(--me-blue)' : 'var(--me-grey-50)'} />
      <span>{label}</span>
    </button>
  )
}
