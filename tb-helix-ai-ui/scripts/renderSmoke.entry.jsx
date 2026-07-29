// Temporary render smoke test — renders each route, and each case stage, to a
// string in Node to catch render-time crashes. Not part of the app.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import AppShell from '@platform/AppShell'
import { CaseContext } from '@modules/lc-check/state/CaseContext'
import { summariseRun } from '@modules/lc-check/state/runCost'
import { STAGES, needsAction } from '@modules/lc-check/state/severity'
import { caseDetailFor } from '@modules/lc-check/data/fixtures.js'
import IntakeScreen from '@modules/lc-check/screens/IntakeScreen'
import InterpretScreen from '@modules/lc-check/screens/InterpretScreen'
import ChecksScreen from '@modules/lc-check/screens/ChecksScreen'
import ReviewScreen from '@modules/lc-check/screens/ReviewScreen'
import DecisionScreen from '@modules/lc-check/screens/DecisionScreen'
import CaseHeader from '@modules/lc-check/components/CaseHeader'
import CostDrawer from '@modules/lc-check/components/CostDrawer'
import AskDrawer from '@modules/lc-check/components/AskDrawer'

const ROUTES = [
  '/',
  '/lc-check/cases',
    '/lc-check/cases/CHK-25-0128-014/intake',
  '/governance/checks',
  '/governance/agents',
  '/governance/dictionary',
  '/governance/library',
  '/nonsense',
]

// A finished run with a couple of decisions already made — the state in which
// the most conditional branches on every screen are live.
function finishedCaseValue() {
  const data = caseDetailFor('CHK-25-0128-014')
  const areaIds = data.areas.map((a) => a.id)
  const findings = data.findings
  return {
    caseId: data.id,
    loading: false,
    error: null,
    data,
    run: { segmented: 6, segmentTotal: 6, completedAreaIds: areaIds, activeAreaId: null, started: true, finished: true, mode: 'auto' },
    officer: {
      decisions: { 'f-date': 'agreed', 'f-cert': 'parked' },
      notes: { 'f-date': 'Applicant contacted.' },
      drafts: {},
      addedChecks: [],
      verdict: 'refuse',
      reviewNote: 'Shipment is late — raising it.',
      submitted: false,
    },
    ui: { toast: 'Saved', askOpen: true, costOpen: true, askThread: [{ who: 'assistant', text: 'Ask me anything.' }, { who: 'officer', text: 'Why?' }] },
    visible: {
      findings,
      attention: findings.filter(needsAction),
      clean: findings.filter((f) => f.severity === 'clean'),
      manual: findings.filter((f) => f.severity === 'manual'),
    },
    stages: STAGES,
    actions: {
      flash() {}, startRun() {}, advanceRun() {}, decide() {}, saveNote() {},
      addCheck() {}, submit() {}, askQuestion() {}, dispatch() {},
    },
  }
}

// A run that has not started — the other end of every conditional.
function freshCaseValue() {
  const v = finishedCaseValue()
  return {
    ...v,
    run: { segmented: 0, segmentTotal: 6, completedAreaIds: [], activeAreaId: null, started: false, finished: false, mode: 'step' },
    officer: { ...v.officer, decisions: {}, notes: {}, reviewNote: '' },
    ui: { ...v.ui, toast: null, askOpen: false, costOpen: false },
    visible: { findings: [], attention: [], clean: [], manual: [] },
  }
}

const noop = () => {}

function stageCases(value, tag) {
  const cost = summariseRun(value.data.runSteps, value.run.finished ? value.data.runSteps.length : 0, value.data.bundlePages.length)
  return [
    [`${tag} intake`, <IntakeScreen />],
    [`${tag} interpret`, <InterpretScreen />],
    [`${tag} checks`, <ChecksScreen onOpenFinding={noop} />],
    [`${tag} review`, <ReviewScreen selectedId={null} onSelect={noop} onJumpToRead={noop} />],
    [`${tag} decision`, <DecisionScreen onOpenFinding={noop} />],
    [
      `${tag} header`,
      <CaseHeader
        caseId={value.data.id}
        detail={value.data}
        status={{ tone: 'blue', label: 'Review running' }}
        stages={STAGES}
        activeStage="review"
        onStage={noop}
        runMode={value.run.mode}
        onRunMode={noop}
        cost={cost}
        costOpen={false}
        onToggleCost={noop}
        askOpen={false}
        onToggleAsk={noop}
        actionLabel="Next"
        onAction={noop}
      />,
    ],
    [
      `${tag} cost drawer`,
      <CostDrawer open onClose={noop} cost={cost} stepCount={value.data.runSteps.length} completedCount={value.run.finished ? value.data.runSteps.length : 0} pageCount={value.data.bundlePages.length} modelSummary={value.data.runModelSummary} />,
    ],
    [`${tag} ask drawer`, <AskDrawer open onClose={noop} context="ctx" thread={value.ui.askThread} onAsk={noop} />],
  ]
}

export function run() {
  const results = []

  for (const path of ROUTES) {
    try {
      const html = renderToString(
        <StaticRouter location={path}>
          <AppShell />
        </StaticRouter>,
      )
      results.push({ name: `route ${path}`, ok: true, bytes: html.length })
    } catch (err) {
      results.push({ name: `route ${path}`, ok: false, error: `${err.message}\n${(err.stack || '').split('\n').slice(1, 5).join('\n')}` })
    }
  }

  for (const [value, tag] of [[finishedCaseValue(), 'finished'], [freshCaseValue(), 'fresh']]) {
    for (const [name, element] of stageCases(value, tag)) {
      try {
        const html = renderToString(
          <StaticRouter location={`/lc-check/cases/${value.data.id}/review`}>
            <CaseContext.Provider value={value}>{element}</CaseContext.Provider>
          </StaticRouter>,
        )
        results.push({ name, ok: true, bytes: html.length })
      } catch (err) {
        results.push({ name, ok: false, error: `${err.message}\n${(err.stack || '').split('\n').slice(1, 5).join('\n')}` })
      }
    }
  }

  return results
}
