import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Toast from '@shared/ds/Toast'
import { plural } from '@shared/lib/format'
import CaseHeader from '../components/CaseHeader'
import AskDrawer from '../components/AskDrawer'
import CostDrawer from '../components/CostDrawer'
import IntakeScreen from './IntakeScreen'
import ReadScreen from './ReadScreen'
import ChecksScreen from './ChecksScreen'
import ReviewScreen from './ReviewScreen'
import DecisionScreen from './DecisionScreen'
import { CaseProvider, useCase } from '../state/CaseContext'
import { summariseRun } from '../state/runCost'
import { STAGES, stageIndex } from '../state/severity'

// The case workbench. The stage lives in the URL (`/lc-check/cases/:id/:stage`)
// so a stage is linkable and the back button steps through the review the way
// the officer walked it.
export default function CaseWorkbench() {
  const { caseId } = useParams()
  return (
    <CaseProvider caseId={caseId}>
      <WorkbenchBody />
    </CaseProvider>
  )
}

function WorkbenchBody() {
  const { caseId, data, loading, error, run, visible, ui, actions } = useCase()
  const { stage } = useParams()
  const navigate = useNavigate()
  const [selectedFindingId, setSelectedFindingId] = useState(null)

  // Read is a full-height three-pane layout, so it needs to know how tall the
  // header is. Published as a CSS variable and kept current with a
  // ResizeObserver — the facts strip wraps at narrow widths.
  const headerRef = useRef(null)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return undefined
    const publish = () => document.documentElement.style.setProperty('--case-header-h', `${el.offsetHeight}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  })

  const activeStage = STAGES.some((s) => s.id === stage) ? stage : 'intake'
  const goStage = (id) => navigate(`/lc-check/cases/${caseId}/${id}`)

  // The cost pill and the drawer read the same summary, so they cannot disagree.
  // One run step precedes the areas (intake) and one follows the plan (the
  // driver), hence the +2 when mapping completed areas onto completed steps.
  const cost = useMemo(() => {
    if (!data) return null
    const completedSteps = run.finished
      ? data.runSteps.length
      : run.started
        ? Math.min(run.completedAreaIds.length + 2, data.runSteps.length)
        : 0
    return summariseRun(data.runSteps, completedSteps, data.bundlePages.length)
  }, [data, run.finished, run.started, run.completedAreaIds.length])

  if (loading) {
    return <div style={{ padding: '26px 32px', fontSize: 13, color: 'var(--me-grey-70)' }}>Opening {caseId}…</div>
  }
  if (error) {
    return (
      <div style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: 'var(--me-ink)' }}>Could not open this case</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--me-grey-70)' }}>{error}</p>
      </div>
    )
  }

  const openFinding = (findingId) => {
    setSelectedFindingId(findingId)
    goStage('review')
  }

  const jumpToRead = () => goStage('read')

  // The primary button is for advancing the *run*, not for moving between stages —
  // the stage tabs already do that, and in auto mode the run drives itself, so a
  // "Next" button was offering to do nothing the officer needed. It therefore
  // appears only when there is genuinely a pipeline action to take.
  const stepMode = run.mode === 'step'
  const action = (() => {
    if (!run.started) {
      return {
        label: 'Start the review',
        run: () => {
          actions.startRun(run.mode)
          actions.flash(
            stepMode
              ? 'Step mode — we pause after each area so you can look.'
              : 'Review started — checks run while you look at what we read.',
          )
          goStage(stepMode ? 'checks' : 'read')
        },
      }
    }
    if (stepMode && !run.finished) {
      return { label: 'Run the next area', run: () => { actions.advanceRun(); goStage('checks') } }
    }
    return null
  })()

  const status = run.finished
    ? { tone: 'error', label: `${plural(visible.attention.filter((f) => f.severity === 'discrepancy').length, 'discrepancy', 'discrepancies')} · reply due` }
    : run.started
      ? { tone: 'blue', label: 'Review Running' }
      : { tone: 'neutral', label: 'Awaiting Check' }

  return (
    <>
      <CaseHeader
        headerRef={headerRef}
        caseId={caseId}
        detail={data}
        status={status}
        stages={STAGES}
        activeStage={activeStage}
        onStage={goStage}
        runMode={run.mode}
        onRunMode={(mode) => actions.dispatch({ type: 'run_mode', mode })}
        cost={cost}
        costOpen={ui.costOpen}
        onToggleCost={() => actions.dispatch({ type: 'toggle_cost' })}
        askOpen={ui.askOpen}
        onToggleAsk={() => actions.dispatch({ type: 'toggle_ask' })}
        actionLabel={action?.label}
        onAction={action?.run}
      />

      {activeStage === 'intake' ? <IntakeScreen /> : null}
      {activeStage === 'read' ? <ReadScreen /> : null}
      {activeStage === 'checks' ? <ChecksScreen onOpenFinding={openFinding} /> : null}
      {activeStage === 'review' ? (
        <ReviewScreen selectedId={selectedFindingId} onSelect={setSelectedFindingId} onJumpToRead={jumpToRead} />
      ) : null}
      {activeStage === 'decide' ? <DecisionScreen onOpenFinding={openFinding} /> : null}

      <AskDrawer
        open={ui.askOpen}
        onClose={() => actions.dispatch({ type: 'toggle_ask' })}
        context={`Credit ${data.credit.creditRef} · ${data.documents.filter((d) => d.role === 'presented').length} documents`}
        thread={ui.askThread}
        onAsk={actions.askQuestion}
      />

      <CostDrawer
        open={ui.costOpen}
        onClose={() => actions.dispatch({ type: 'toggle_cost' })}
        cost={cost}
        stepCount={data.runSteps.length}
        completedCount={cost.rows.filter((r) => r.state === 'done').length}
        pageCount={data.bundlePages.length}
        modelSummary={data.runModelSummary}
      />

      <Toast message={ui.toast} />
    </>
  )
}
