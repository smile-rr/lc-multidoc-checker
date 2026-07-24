import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { initialState, deriveVals } from './store'
import { Z } from './ds/z'
import ConfirmDialog from './ds/ConfirmDialog'
import ChecksSection from './sections/ChecksSection'
import CheckDetail from './sections/CheckDetail'
import AgentsList from './sections/AgentsList'
import AgentDetail from './sections/AgentDetail'
import Dictionary from './sections/Dictionary'
import Library from './sections/Library'
import ReviewPanel from './components/ReviewPanel'
import ImportModal from './modals/ImportModal'
import AddCaseModal from './modals/AddCaseModal'
import TestRunModal from './modals/TestRunModal'

// LC Compliance Governance Console — root shell. Holds the single console state
// object and re-derives the view-model on every render (mirrors the design's
// DCLogic.renderVals). `setState` merges a partial or an updater, like the
// original design runtime.
export default function App() {
  const [state, setRaw] = useState(initialState)
  const setState = (partial) =>
    setRaw((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }))
  const v = deriveVals(state, setState)

  // Publish the sticky nav's height so section toolbars can stick just below it.
  const navRef = useRef(null)
  useLayoutEffect(() => {
    if (navRef.current) document.documentElement.style.setProperty('--nav-h', navRef.current.offsetHeight + 'px')
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--me-grey-08)' }}>
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

      {/* Level-1 section tabs */}
      <div ref={navRef} style={{ background: '#fff', borderBottom: '1px solid var(--me-grey-15)', position: 'sticky', top: 0, zIndex: Z.nav }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 26 }}>
          <NavTab label="Checks" onClick={v.goChecks} border={v.navChecksBorder} color={v.navChecksColor} weight={v.navChecksWeight} />
          <NavTab label="Agents" onClick={v.goAgents} border={v.navAgentsBorder} color={v.navAgentsColor} weight={v.navAgentsWeight} />
          <NavTab label="Dictionary" onClick={v.goDictionary} border={v.navDictBorder} color={v.navDictColor} weight={v.navDictWeight} />
          <NavTab label="Library" onClick={v.goLibrary} border={v.navLibraryBorder} color={v.navLibraryColor} weight={v.navLibraryWeight} />
        </div>
      </div>

      <div>
        {v.isChecks && <ChecksSection v={v} />}
        {v.isCheckDetail && <CheckDetail v={v} />}
        {v.isAgentsList && <AgentsList v={v} />}
        {v.isAgentDetail && <AgentDetail v={v} />}
        {v.isDictionary && <Dictionary v={v} />}
        {v.isLibrary && <Library v={v} />}
      </div>

      <ImportModal v={v} />
      <AddCaseModal v={v} />
      <TestRunModal v={v} />
      <ConfirmDialog confirm={v.confirm} />
    </div>
  )
}

function NavTab({ label, onClick, border, color, weight }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: '18px 2px', background: 'none', border: 'none', borderBottom: `3px solid ${border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: weight, color, marginBottom: -1 }}
    >
      {label}
    </button>
  )
}
