import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { initialState, deriveVals, loadCatalog } from './store'
import { loadAll } from './api/governanceApi'
import { isApi } from '@shared/lib/dataSource'
import { Z } from '@shared/ds/z'
import ConfirmDialog from '@shared/ds/ConfirmDialog'
import ChecksSection from './sections/ChecksSection'
import CheckDetail from './sections/CheckDetail'
import AgentsList from './sections/AgentsList'
import AgentDetail from './sections/AgentDetail'
import Dictionary from './sections/Dictionary'
import Library from './sections/Library'
import Prices from './sections/Prices'
import ReviewPanel from './components/ReviewPanel'
import CatalogNotice from './components/CatalogNotice'
import ImportModal from './modals/ImportModal'
import AddCaseModal from './modals/AddCaseModal'
import TestRunModal from './modals/TestRunModal'
import { SECTIONS } from './sections.js'

// LC Compliance Governance — module root. Holds the single console state object
// and re-derives the view-model on every render (mirrors the design's
// DCLogic.renderVals). `setState` merges a partial or an updater.
//
// The module owns `state.section`; the platform owns the URL. The two are kept
// in step below so the side rail, deep links and the back button all agree,
// without the store having to know a router exists.
const validSection = (id) => (SECTIONS.some((s) => s.id === id) ? id : SECTIONS[0].id)

export default function GovernanceModule() {
  const navigate = useNavigate()
  const { section: urlSection } = useParams()

  // Seed the section from the URL rather than syncing it after mount, so a deep
  // link renders its own section immediately instead of flashing Checks first.
  // The catalogue has to be in `seed` before initialState is built, because the
  // store binds parts of it at import. So nothing renders until the load settles —
  // under mock that is one tick, and under the API it is one request.
  //
  // A failed load falls through to the fixture rather than to an error screen: the
  // seed IS what the service was seeded from, so an offline authoring session shows
  // real rules rather than an apology. A dismissible corner notice says which one.
  const [catalog, setCatalog] = useState(() => (isApi ? { state: 'loading' } : { state: 'ready' }))

  useEffect(() => {
    if (!isApi) return
    let live = true
    loadAll()
      .then((data) => { if (live) { loadCatalog(data); setCatalog({ state: 'ready' }) } })
      .catch((error) => { if (live) setCatalog({ state: 'ready', error }) })
    return () => { live = false }
  }, [])

  const [state, setRaw] = useState(() => ({ ...initialState, section: validSection(urlSection) }))
  const setState = (partial) =>
    setRaw((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }))
  const v = deriveVals(state, setState)

  const current = state.section || SECTIONS[0].id

  // URL → store: a rail click or a pasted link selects the section.
  useEffect(() => {
    if (urlSection && urlSection !== current && SECTIONS.some((s) => s.id === urlSection)) {
      setState({ section: urlSection, panel: null, activeCheckId: null, dictDetail: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSection])

  // Store → URL: flows that move section from inside the module (new check, new
  // agent, backing out of a check detail) keep the address bar honest.
  useEffect(() => {
    if (current !== urlSection) navigate(`/governance/${current}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Publish the tab bar's height so section toolbars stick just below it.
  const navRef = useRef(null)
  useLayoutEffect(() => {
    if (navRef.current) document.documentElement.style.setProperty('--nav-h', `${navRef.current.offsetHeight}px`)
  }, [])

  // Esc closes the review drawer (quality-floor dismiss).
  useEffect(() => {
    if (!v.reviewOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setState({ panel: null }) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.reviewOpen])

  // Drawer can be dragged by its header and collapsed to just its header.
  // Both reset to the anchored position each time it's (re)opened for a target.
  const [dragPos, setDragPos] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const posRef = useRef({ left: 0, top: 0 })
  useEffect(() => { setDragPos(null); setCollapsed(false) }, [v.reviewAnchorX, v.reviewAnchorY])
  const startDrag = (e) => {
    const W = 380
    const start = { x: e.clientX, y: e.clientY, left: posRef.current.left, top: posRef.current.top }
    const onMove = (ev) => setDragPos({
      left: Math.max(8, Math.min(start.left + (ev.clientX - start.x), window.innerWidth - W - 8)),
      top: Math.max(56, Math.min(start.top + (ev.clientY - start.y), window.innerHeight - 60)),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  // After every hook, so the hook order never changes between renders.
  if (catalog.state === 'loading') {
    return (
      <div className="helix-screen" style={{ minHeight: '100vh', background: 'var(--me-grey-08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--me-grey-70)' }}>Loading the catalogue…</span>
      </div>
    )
  }

  return (
    <div className="helix-screen" style={{ minHeight: '100vh', background: 'var(--me-grey-08)' }}>
      {/* Offline fallback — fixed corner, never a top strip. Silent fixture use
          would let an author spend an afternoon on rules nobody will ever run. */}
      {catalog.error && <CatalogNotice detail={catalog.error.message} />}
      {/* Floating review/assistant drawer — sits beside the card that opened it:
          vertical from the opener icon, horizontal just right of that card with
          a 16px gutter, both clamped on-screen. */}
      {v.reviewOpen && (() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
        const vh = typeof window !== 'undefined' ? window.innerHeight : 900
        const W = 380
        const GAP = 16
        const baseTop = Math.min(Math.max(74, Math.round(v.reviewAnchorY ?? 74)), Math.max(74, vh - 380))
        const rawLeft = v.reviewAnchorX != null ? Math.round(v.reviewAnchorX) + GAP : vw - W - GAP
        const baseLeft = Math.min(Math.max(16, rawLeft), vw - W - 12)
        const pos = dragPos || { left: baseLeft, top: baseTop }
        posRef.current = pos
        return (
          <div style={{ position: 'fixed', left: pos.left, top: pos.top, width: W, maxHeight: collapsed ? 'none' : `calc(100vh - ${pos.top + 16}px)`, zIndex: Z.drawer, border: '1px solid var(--me-grey-15)', borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 10px 34px rgba(27,28,30,.16)' }}>
            <ReviewPanel ctx={v.reviewCtx} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} onDragStart={startDrag} />
          </div>
        )
      })()}

      {/* Level-1 section tabs. These belong to the module, not the platform rail:
          they are governance's own surfaces, and the rail stays one row per
          module so the two products read as peers. */}
      <div ref={navRef} style={{ background: '#fff', borderBottom: '1px solid var(--me-grey-15)', position: 'sticky', top: 0, zIndex: Z.nav }}>
        {/* Same measure as the sections below it, so the tabs line up with the
            content they switch between rather than sitting inside it. */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 26 }}>
          {SECTIONS.map((s) => {
            const on = s.id === current
            return (
              <button
                key={s.id}
                onClick={() => v.confirmLeave(() => navigate(`/governance/${s.id}`))}
                style={{
                  padding: '18px 2px',
                  background: 'none',
                  border: 'none',
                  borderBottom: `3px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  fontWeight: on ? 700 : 500,
                  color: on ? 'var(--me-ink)' : 'var(--me-grey-70)',
                  marginBottom: -1,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        {v.isChecks && <ChecksSection v={v} />}
        {v.isCheckDetail && <CheckDetail v={v} />}
        {v.isAgentsList && <AgentsList v={v} />}
        {v.isAgentDetail && <AgentDetail v={v} />}
        {v.isDictionary && <Dictionary v={v} />}
        {v.isLibrary && <Library v={v} />}
        {v.isPrices && <Prices requestConfirm={v.requestConfirm} />}
      </div>

      <ImportModal v={v} />
      <AddCaseModal v={v} />
      <TestRunModal v={v} />
      <ConfirmDialog confirm={v.confirm} />
    </div>
  )
}
