import { Routes, Route, Navigate } from 'react-router-dom'
import CasesScreen from './screens/CasesScreen'
import CaseWorkbench from './screens/CaseWorkbench'

const BASE = '/lc-check'

function LcCheckRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to={`${BASE}/cases`} replace />} />
      <Route path="cases" element={<CasesScreen />} />
      {/* Stage in the URL, so every step of a review is linkable. */}
      <Route path="cases/:caseId" element={<Navigate to="intake" replace />} />
      <Route path="cases/:caseId/:stage" element={<CaseWorkbench />} />
    </Routes>
  )
}

// A single entry point. There is only one thing to do here — work a case — and
// "my queue" was a filter rather than a place; it lives as a chip on the Cases
// screen. A module with one nav item renders as a plain rail row.
export const lcCheckModule = {
  id: 'lc-check',
  label: 'LC check',
  icon: 'file-check',
  basePath: BASE,
  navItems: [{ id: 'cases', label: 'Cases', icon: 'folder-open', path: `${BASE}/cases` }],
  Routes: LcCheckRoutes,
  matchNav: () => 'cases',
}
