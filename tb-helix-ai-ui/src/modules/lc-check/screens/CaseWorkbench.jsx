import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Toast from '@shared/ds/Toast'
import ErrorBoundary from '@shared/ds/ErrorBoundary'
import { plural } from '@shared/lib/format'
import CaseHeader from '../components/CaseHeader'
import AskDrawer from '../components/AskDrawer'
import CostDrawer from '../components/CostDrawer'
import RunLogPanel from '../components/RunLogPanel'
import useRunLog from '../state/useRunLog'
import IntakeScreen from './IntakeScreen'
import InterpretScreen from './InterpretScreen'
import ChecksScreen from './ChecksScreen'
import ReviewScreen from './ReviewScreen'
import DecisionScreen from './DecisionScreen'
import { CaseProvider, useCase } from '../state/CaseContext'
import { summariseRun, summariseLedger } from '../state/runCost'
import { STAGES, RUN_STAGES, stageMeta, stageAfter } from '../state/severity'

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
  const { caseId, data, loading, error, run, runStages, visible, ui, actions } = useCase()
  // The service's list once it has answered; the built-in order until then.
  const bar = runStages ?? RUN_STAGES
  const { stage } = useParams()
  const navigate = useNavigate()
  const [selectedFindingId, setSelectedFindingId] = useState(null)
  // Always on, not only while the log panel is open: the cost pill in the header
  // reads the same numbers, and a pill that was blank until you opened a drawer
  // would be reporting the drawer's state rather than the case's.
  //
  // Cost drawer open → pull ledger immediately; while a stage is live, also poll
  // every 4s so a late ledger write after llm_call does not leave a stale total.
  const runLive = !!(run.busy || run.activeStage)
  const { spend, refreshSpend } = useRunLog(caseId, true, {
    spendFocus: ui.costOpen,
    pollSpendMs: ui.costOpen && runLive ? 4000 : 0,
  })

  const activeStage = STAGES.some((s) => s.id === stage) ? stage : 'intake'
  const goStage = (id) => navigate(`/lc-check/cases/${caseId}/${id}`)

  // The stage tabs follow the run, so a person who starts it and looks away is
  // not left on a stage that finished a minute ago. Following stops the moment
  // the officer picks a tab themselves — a run that yanks the view out from
  // under someone reading is worse than one that sits still.
  useEffect(() => {
    if (!run.live || !run.following) return
    if (run.activeStage) {
      const target = stageMeta(run.activeStage, bar)?.stage
      if (target && target !== activeStage) navigate(`/lc-check/cases/${caseId}/${target}`, { replace: true })
    } else if (run.finished && run.mode === 'auto' && activeStage !== 'review') {
      // Auto ends at the report. Step waits to be asked.
      navigate(`/lc-check/cases/${caseId}/review`, { replace: true })
    }
  }, [run.live, run.following, run.activeStage, run.finished, run.mode, activeStage, caseId, navigate])

  // The cost pill and the drawer read the same summary, so they cannot disagree.
  // The fixture's run steps are one for reading, one for planning, one for the
  // driver, then one per review area — which is exactly what the pipeline steps
  // now report, so this is a mapping rather than an estimate.
  const cost = useMemo(() => {
    if (!data) return null
    const executing = run.activeStage === 'execute' || run.done.includes('execute')
    const completedSteps = run.finished
      ? data.runSteps.length
      : Math.min(
          (run.done.includes('interpret') ? 1 : 0) +
            (run.done.includes('plan') ? 1 : 0) +
            (executing ? 1 : 0) +
            run.completedAreaIds.length,
          data.runSteps.length,
        )
    // The ledger when the service has one, the estimate otherwise. Never both:
    // two numbers for one question is how a cost panel loses its authority.
    if (spend?.length) return summariseLedger(spend, data.bundlePages.length)
    return summariseRun(data.runSteps, completedSteps, data.bundlePages.length)
  }, [data, spend, run.finished, run.done, run.activeStage, run.completedAreaIds.length])

  if (loading) {
    return <WorkbenchSkeleton caseId={caseId} />
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

  const jumpToInterpret = () => goStage('interpret')

  // The primary button advances the *run*, never the tabs — the tabs already do
  // that, and a "Next" button that only changed the view would be offering to do
  // nothing. It says what pressing it will run, so the cost of pressing it is
  // legible before it is pressed.
  const stepping = run.mode === 'step'
  const nextStage = stageAfter(run.done, bar)
  const action = (() => {
    // A hard check stopped it. Nothing runs until an officer takes that ground on
    // themselves, so the button offers the only move there is and names the check
    // it releases — "Continue the review" here would run the same gate into the
    // same wall and look like a bug.
    if (run.halted) {
      return {
        label: `Override ${run.haltedBy ?? 'the hard check'} and continue`,
        run: () => {
          actions.overrideGate(`Officer accepted the ground of ${run.haltedBy ?? 'the hard check'}`)
          actions.flash('Halt released. The finding stays on the case.')
        },
      }
    }
    // Intake is still reading. Named rather than absent, and disabled rather than
    // hidden: the officer should be able to see that the case is doing something
    // and that starting a review is not yet one of the things they can do.
    if (run.busy && !run.activeStage) {
      return { label: run.activity ?? 'Reading…', disabled: true }
    }
    if (run.activeStage) {
      // Named rather than hidden: a button that vanishes mid-run reads as a
      // finished run. Disabled, so it cannot be pressed twice.
      return { label: stageMeta(run.activeStage, bar)?.running ?? 'Running…', disabled: true }
    }
    if (run.finished) {
      // Both modes: the run is over and the report is the next place to go.
      // Auto used to hide the button here, which read as a dead workbench.
      return activeStage !== 'review' ? { label: 'Open the report', run: () => goStage('review') } : null
    }
    if (!run.started) {
      return {
        label: stepping ? nextStage?.action ?? 'Start the review' : 'Start the review',
        run: () => {
          actions.runNext()
          if (!stepping) actions.flash('Started — it runs to the report without stopping.')
        },
      }
    }
    // Step: idle between stages — the button names the next press.
    // Auto: chains itself when live; if not (reload / recovered after a stop),
    // offer Continue rather than a vanished or forever-disabled control.
    if (stepping && nextStage) {
      return { label: nextStage.action, run: actions.runNext }
    }
    if (!stepping && nextStage) {
      if (!run.live) {
        return { label: 'Continue the review', run: actions.runNext }
      }
      return { label: stageMeta(nextStage.id, bar)?.running ?? 'Running…', disabled: true }
    }
    return null
  })()

  const status = run.halted
    // Not "Paused". The examination stopped on purpose and will not resume by
    // itself, which is a different thing to tell an officer than "still going".
    ? { tone: 'warning', label: `Halted · ${run.haltedBy ?? 'hard check'}` }
    : run.failure
    ? { tone: 'error', label: 'Stopped' }
    : run.busy && !run.activeStage
    ? { tone: 'blue', label: run.activity ?? 'Reading' }
    : run.finished
    ? { tone: 'error', label: `${plural(visible.attention.filter((f) => f.severity === 'discrepancy').length, 'discrepancy', 'discrepancies')} · reply due` }
    : run.activeStage
      ? { tone: 'blue', label: stageMeta(run.activeStage, bar)?.badge ?? 'Review Running' }
      : run.started
        ? { tone: 'blue', label: `Paused · ${run.done.length} of ${bar.length} Steps` }
        : { tone: 'neutral', label: 'Awaiting Check' }

  return (
    // One viewport, bounded. The header takes what it needs, the stage gets the rest,
    // and every pane inside reaches the bottom of the window because its parent ends
    // there. Nothing here scrolls — the panes do, which is what makes a list and the
    // document beside it independently scrollable.
    <div style={{ height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CaseHeader
        caseId={caseId}
        detail={data}
        status={status}
        stages={STAGES}
        activeStage={activeStage}
        onStage={(id) => { actions.dispatch({ type: 'unfollow' }); goStage(id) }}
        runMode={run.mode}
        onRunMode={(mode) => actions.dispatch({ type: 'run_mode', mode })}
        cost={cost}
        costOpen={ui.costOpen}
        onToggleCost={() => actions.dispatch({ type: 'toggle_cost' })}
        askOpen={ui.askOpen}
        onToggleAsk={() => actions.dispatch({ type: 'toggle_ask' })}
        logOpen={ui.logOpen}
        onToggleLog={() => actions.dispatch({ type: 'toggle_log' })}
        runBusy={run.busy || !!run.activeStage}
        actionLabel={action?.label}
        actionDisabled={action?.disabled}
        onAction={action?.run}
      />

      {/* The stage area. Each screen is a flex column that fills this and owns its
          own scrolling — see `components/paneHeight`.

          Bounded by an error boundary, because everything below this line renders
          service-shaped data and a field that turns out to be absent used to throw,
          unmount the whole tree and leave a white screen — the officer's case gone,
          with nothing on it to report. Keyed on the stage so moving away and back
          clears a failure instead of latching it. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary label={`The ${activeStage} stage`} resetKey={`${caseId}:${activeStage}`}>
          {activeStage === 'intake' ? <IntakeScreen /> : null}
          {activeStage === 'interpret' ? <InterpretScreen /> : null}
          {activeStage === 'checks' ? <ChecksScreen onOpenFinding={openFinding} /> : null}
          {activeStage === 'review' ? (
            <ReviewScreen selectedId={selectedFindingId} onSelect={setSelectedFindingId} onJumpToInterpret={jumpToInterpret} />
          ) : null}
          {activeStage === 'decide' ? <DecisionScreen onOpenFinding={openFinding} /> : null}
        </ErrorBoundary>
      </div>

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
        stepCount={cost.rows.length}
        completedCount={cost.rows.filter((r) => r.state === 'done').length}
        pageCount={data.bundlePages.length}
        onRefresh={refreshSpend}
        live={runLive}
      />

      <RunLogPanel
        open={ui.logOpen}
        onClose={() => actions.dispatch({ type: 'toggle_log' })}
        caseId={data.id}
      />

      <Toast message={ui.toast} />
    </div>
  )
}

// The workbench before its case has arrived.
//
// The same bones in the same places — a header band, a rail, a reading column —
// so the case lands *into* a page rather than replacing one. A single line of
// text on white reads as a screen that failed, and for the second or two it is up
// it is indistinguishable from one.
function WorkbenchSkeleton({ caseId }) {
  const block = (h, w, radius = 4) => ({
    height: h,
    width: w,
    borderRadius: radius,
    background: 'var(--me-grey-08)',
  })
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-busy="true">
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', alignItems: 'center', gap: 14, background: '#fff' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--me-ink)' }}>{caseId}</span>
        <div style={block(11, 150)} />
        <div style={{ flex: 1 }} />
        <div style={block(28, 110, 8)} />
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 14, padding: '16px 24px', minHeight: 0 }}>
        <div style={{ width: 240, flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={block(56, '100%', 10)} />
          <div style={block(56, '100%', 10)} />
        </div>
        <div style={{ flex: 1, minWidth: 0, maxWidth: 1040, ...block('100%', 'auto', 12) }} />
      </div>
      <p style={{ margin: 0, padding: '0 24px 18px', fontSize: 12.5, color: 'var(--me-grey-70)' }}>Opening the case…</p>
    </div>
  )
}
