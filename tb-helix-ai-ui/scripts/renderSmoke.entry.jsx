// Temporary render smoke test — renders each route, and each case stage, to a
// string in Node to catch render-time crashes. Not part of the app.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import AppShell from '@platform/AppShell'
import { CaseContext } from '@modules/lc-check/state/CaseContext'
import { summariseRun } from '@modules/lc-check/state/runCost'
import { STAGES } from '@modules/lc-check/state/stages'
import { caseDetailFor } from '@modules/lc-check/data/fixtures.js'
import IntakeScreen from '@modules/lc-check/screens/IntakeScreen'
import InterpretScreen from '@modules/lc-check/screens/InterpretScreen'
import ChecksScreen from '@modules/lc-check/screens/ChecksScreen'
import ReviewScreen from '@modules/lc-check/screens/ReviewScreen'
import DecisionScreen from '@modules/lc-check/screens/DecisionScreen'
import CaseHeader from '@modules/lc-check/components/CaseHeader'
import CostDrawer from '@modules/lc-check/components/CostDrawer'
import AskDrawer from '@modules/lc-check/components/AskDrawer'
import RunLogPanel from '@modules/lc-check/components/RunLogPanel'
import CheckDetail from '@modules/governance/sections/CheckDetail'
import { initialState, deriveVals } from '@modules/governance/store'

const ROUTES = [
  '/',
  '/lc-check/cases',
    '/lc-check/cases/CHK-25-0128-014/intake',
  '/governance/checks',
  '/governance/agents',
  '/governance/dictionary',
  '/governance/library',
  '/governance/simulator',
  '/governance/prices',
  '/nonsense',
]

// A finished run with a couple of overrides already made — the state in which
// the most conditional branches on every screen are live.
//
// Both directions are covered on purpose, because they render differently and only
// one of them is common: `f-date` is a discrepancy an officer cleared (the seam,
// with the engine's value struck behind theirs), `f-cert` is a doubt they called
// discrepant (the rare direction). A fixture with only the common one leaves the
// other rendering path untested until a real officer finds it.
const callOf = (overrides) => (f) => {
  const machine = f?.outcome ?? 'NOT_RUN'
  const o = f ? overrides[f.id] : null
  return {
    machine,
    value: o?.outcome ?? machine,
    overridden: !!o,
    by: o?.by ?? null,
    at: o?.at ?? null,
    reason: f?.outcomeReason ?? null,
  }
}

function finishedCaseValue() {
  const data = caseDetailFor('CHK-25-0128-014')
  const areaIds = data.areas.map((a) => a.id)
  const findings = data.findings
  const overrides = {
    'f-date': { outcome: 'CLEAN', by: 'R. Ning', at: '2026-07-31T14:22:00Z' },
    'f-cert': { outcome: 'DISCREPANT', by: 'R. Ning', at: '2026-07-31T14:26:00Z' },
  }
  const effective = (f) => callOf(overrides)(f).value
  return {
    caseId: data.id,
    loading: false,
    error: null,
    data,
    run: { segmented: 6, segmentTotal: 6, completedAreaIds: areaIds, activeAreaId: null, started: true, finished: true, mode: 'auto', done: ['interpret', 'plan', 'execute'], activeStep: null },
    officer: {
      overrides,
      notes: { 'f-date': 'Applicant contacted.' },
      drafts: {},
      addedChecks: [], raised: [], stopOnRuleFailure: true,
      status: null,
      reviewNote: 'Shipment is late — raising it.',
      submitted: false,
    },
    ui: { toast: 'Saved', askOpen: true, costOpen: true, askThread: [{ who: 'assistant', text: 'Ask me anything.' }, { who: 'officer', text: 'Why?' }] },
    visible: {
      findings,
      attention: findings.filter((f) => effective(f) === 'DISCREPANT' || effective(f) === 'DOUBT'),
      clean: findings.filter((f) => effective(f) === 'CLEAN'),
      doubt: findings.filter((f) => effective(f) === 'DOUBT'),
    },
    stages: STAGES,
    // Discrepant, because `f-cert` above was called one by hand — which exercises
    // the branch where the officer's status matches the derived one but was not
    // chosen, and so still renders the "derived" mark.
    status: { derived: 'DISCREPANT', value: 'DISCREPANT', chosen: false },
    // Closed over `overrides` rather than reading `this` — the screens destructure
    // these off the context, which drops the receiver.
    callOf: callOf(overrides),
    actions: {
      flash() {}, startRun() {}, advanceRun() {}, override() {}, saveNote() {}, raiseFinding() {},
      addCheck() {}, submit() {}, askQuestion() {}, dispatch() {},
    },
  }
}

// A run that has not started — the other end of every conditional.
function freshCaseValue() {
  const v = finishedCaseValue()
  return {
    ...v,
    run: { segmented: 0, segmentTotal: 6, completedAreaIds: [], activeAreaId: null, started: false, finished: false, mode: 'step', done: [], activeStep: null },
    officer: { ...v.officer, overrides: {}, notes: {}, reviewNote: '', status: null },
    callOf: callOf({}),
    // Nothing has run, so nothing is unresolved and nothing refuses it. The derived
    // status of an empty case is Clean, and that is the branch worth rendering — it
    // is the one where the sign-off panel is at its most confident and has the least
    // behind it.
    status: { derived: 'CLEAN', value: 'CLEAN', chosen: false },
    ui: { ...v.ui, toast: null, askOpen: false, costOpen: false },
    visible: { findings: [], attention: [], clean: [], doubt: [] },
  }
}

// A case the service is still reading — the state a case is in for the first
// seconds of its life, between "Create check" and the credit coming back.
//
// Worth a target of its own because no fixture is ever in it and it is the one
// state where the data is genuinely incomplete: no documents, no pages, no credit
// reference. A screen that assumed those were there took the whole workbench down
// to a blank page, which is indistinguishable from a crash to the person who just
// pressed the button.
function intakeRunningCaseValue() {
  const v = freshCaseValue()
  return {
    ...v,
    data: {
      ...v.data,
      documents: [],
      bundlePages: [],
      facts: [],
      checks: [],
      findings: [],
      totalPages: 0,
      runState: { stage: 'intake', busy: true, error: null, started: false, finished: false, segmented: 0, completedAreaIds: [] },
    },
    run: { ...v.run, busy: true, activity: 'Reading the credit', failure: null },
  }
}

const noop = () => {}

function stageCases(value, tag) {
  const cost = summariseRun(value.data.runSteps, value.run.finished ? value.data.runSteps.length : 0, value.data.bundlePages.length)
  return [
    [`${tag} intake`, <IntakeScreen />],
    [`${tag} interpret`, <InterpretScreen />],
    [`${tag} checks`, <ChecksScreen onOpenFinding={noop} />],
    [`${tag} review (overview)`, <ReviewScreen selectedId={null} onSelect={noop} onJumpToInterpret={noop} />],
    [`${tag} review (focused)`, <ReviewScreen selectedId={value.visible.findings[0]?.id ?? null} onSelect={noop} onJumpToInterpret={noop} />],
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
        progress={Object.fromEntries(STAGES.map((s) => [s.id, s.id === 'decide' ? 'pending' : 'done']))}
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
      <CostDrawer open onClose={noop} cost={cost} stepCount={value.data.runSteps.length} completedCount={value.run.finished ? value.data.runSteps.length : 0} pageCount={value.data.bundlePages.length} />,
    ],
    [`${tag} ask drawer`, <AskDrawer open onClose={noop} context="ctx" thread={value.ui.askThread} onAsk={noop} />],
    [`${tag} run log`, <RunLogPanel open onClose={noop} caseId={value.data.id} />],
  ]
}

/**
 * A governance check, opened.
 *
 * Check detail is reached by state rather than by URL, so no route renders a check's BODY —
 * the routes above draw the list and stop. That left the three card bodies (comparison,
 * agent, expression) with no render coverage at all, which is where the most conditional
 * markup in the module lives. `E0001` is the graded expiry check: two conditions, two
 * different verdicts, and the only fixture that exercises the ladder editor.
 */
function openCheck(id) {
  let state = { ...initialState, section: 'checks', activeCheckId: id }
  const setState = (partial) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) }
  }
  return deriveVals(state, setState)
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

  for (const [name, id] of [['governance expression card', 'E0001'],
                            ['governance comparison card', 'AVAIL-41A'],
                            ['governance agent card', 'XD-14']]) {
    try {
      const html = renderToString(
        <StaticRouter location="/governance/checks">
          <CheckDetail v={openCheck(id)} />
        </StaticRouter>,
      )
      results.push({ name, ok: true, bytes: html.length })
    } catch (err) {
      results.push({ name, ok: false, error: `${err.message}\n${(err.stack || '').split('\n').slice(1, 5).join('\n')}` })
    }
  }

  // The reading case renders intake only — that is the screen it lands on, and
  // the later stages legitimately have nothing to draw until it finishes.
  for (const [name, element] of [['reading intake', <IntakeScreen />]]) {
    try {
      const html = renderToString(
        <StaticRouter location="/lc-check/cases/CHK-25-0128-011/intake">
          <CaseContext.Provider value={intakeRunningCaseValue()}>{element}</CaseContext.Provider>
        </StaticRouter>,
      )
      results.push({ name, ok: true, bytes: html.length })
    } catch (err) {
      results.push({ name, ok: false, error: `${err.message}\n${(err.stack || '').split('\n').slice(1, 5).join('\n')}` })
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
