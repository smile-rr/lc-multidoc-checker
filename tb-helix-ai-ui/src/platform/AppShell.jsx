import { Routes, Route, Navigate } from 'react-router-dom'
import SideNav from './SideNav'
import NotFound from './NotFound'
import { MODULES, DEFAULT_PATH } from './moduleRegistry'

// The platform frame: the rail on the left, one module's routes on the right.
//
// Deliberately thin. It owns the rail, the content frame and the URL space, and
// nothing else — no case header, no module state, no domain vocabulary. The
// moment the shell knows what an LC case is, the governance module can no longer
// use it.
export default function AppShell() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-sans)', color: 'var(--me-grey)', background: 'var(--me-grey-08)' }}>
      <SideNav />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Navigate to={DEFAULT_PATH} replace />} />
          {MODULES.map((m) => (
            <Route key={m.id} path={`${m.basePath}/*`} element={<m.Routes />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}
