import { lcCheckModule } from '@modules/lc-check'
import { governanceModule } from '@modules/governance'

// ---------------------------------------------------------------------------
// The module registry is the only place the platform learns what exists.
//
// A module descriptor is:
//   {
//     id:        stable key, also the URL segment root
//     label:     side-nav label
//     icon:      lucide name (kebab-case)
//     basePath:  '/lc-check'
//     navItems:  [{ id, label, icon, path }]  — second-level rail entries
//     Routes:    a component rendering this module's <Route> subtree
//     matchNav:  (pathname) => navItem id | null — which rail entry to light up
//   }
//
// Adding a module means adding it here and nowhere else. The platform never
// imports a module's internals, and modules never import each other — anything
// genuinely shared belongs in @shared.
// ---------------------------------------------------------------------------

export const MODULES = [lcCheckModule, governanceModule]

export const DEFAULT_PATH = lcCheckModule.navItems[0].path

export function moduleForPath(pathname) {
  return MODULES.find((m) => pathname === m.basePath || pathname.startsWith(m.basePath + '/')) || null
}
