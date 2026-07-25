import { Routes, Route, Navigate } from 'react-router-dom'
import GovernanceModule from './GovernanceModule'
import { SECTIONS } from './sections.js'

const BASE = '/governance'

// All four sections render the same root component — it switches internally off
// `state.section`, which is synced to the `:section` param. One route with a
// param keeps that contract in one place.
function GovernanceRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to={`${BASE}/${SECTIONS[0].id}`} replace />} />
      <Route path=":section" element={<GovernanceModule />} />
      <Route path=":section/*" element={<GovernanceModule />} />
    </Routes>
  )
}

// One rail entry. The module's four surfaces are its own top tabs, not platform
// navigation — the rail lists products, and a product owns how it is subdivided.
export const governanceModule = {
  id: 'governance',
  label: 'Governance',
  icon: 'shield-check',
  basePath: BASE,
  navItems: [{ id: 'governance', label: 'Governance', icon: 'shield-check', path: `${BASE}/${SECTIONS[0].id}` }],
  Routes: GovernanceRoutes,
  matchNav: () => 'governance',
}

export { SECTIONS }
