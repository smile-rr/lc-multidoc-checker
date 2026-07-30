import { cardSurface } from '@shared/ds/Card'
import { useMemo, useState } from 'react'
import Icon from '@shared/ds/Icon'
import Spinner from '@shared/ds/Spinner'
import { plural } from '@shared/lib/format'
import Chip from '@shared/ds/Chip'
import Button from '@shared/ds/Button'
import { severityMeta } from '../state/severity'
import CheckSpecCard from '../components/CheckSpecCard'
import { useCase } from '../state/CaseContext'

// Stage 3 — the plan, and it running.
//
// The plan is a real artefact, not a progress bar with labels: every check the
// credit brings into play is listed before anything executes, grouped by the
// agent that owns it, and each one carries the rule it will apply plus the
// request that will be sent to apply it.
//
// Three things are deliberate here:
//   · checks the credit does NOT trigger are listed, with the reason — "we didn't
//     check that" must never be discovered after signing
//   · checks the planner wrote for this credit's own :47A: conditions are shown
//     as such, because they did not come from the dictionary and carry different
//     weight
//   · a condition the planner found but no rule covers is marked not covered
//     rather than quietly omitted
//
// Two kinds of check now arrive from Governance, and the plan is where the
// difference has to be legible — not in the pipeline. Adding a stage for the
// deterministic pass would make an officer track four steps to understand a
// division of labour that belongs to the checks themselves:
//
//   Rule cards         the system evaluates rows over extracted fields. No
//                      model, no tokens, milliseconds. Answerable or not, and
//                      which it is is knowable from this screen before the run.
//   Requirement cards  an agent reads prose against the presentation. Tokens,
//                      seconds, judgement.
//
// So: one `execute` step as before, the kind marked on every row, the economics
// of each stated in the header, and the deterministic ones simply resolving the
// instant the run starts — because you do not pace work that takes no time.
export default function ChecksScreen({ onOpenFinding }) {
  const { data, run, officer, actions } = useCase()

  const allChecks = useMemo(() => [...data.checks, ...officer.addedChecks], [data.checks, officer.addedChecks])
  const [selectedId, setSelectedId] = useState(null)

  // Nothing here is running until the execute step is. Planning is its own step,
  // so between the two the plan sits complete and untouched — which is the whole
  // point of separating them.
  const executing = run.activeStep === 'execute' || run.done.includes('execute')
  const planned = run.done.includes('plan')

  const statusOf = (check) => {
    if (!check.areaId) return check.addedByOfficer ? (run.finished ? 'done' : executing ? 'running' : 'planned') : 'skipped'
    if (!executing) return 'planned'
    // A rule is arithmetic over fields already extracted: it settles in the same
    // tick the run starts, so it is never "queued behind" an agent reading pages.
    if (check.kind === 'rule') return 'done'
    if (run.completedAreaIds.includes(check.areaId)) return 'done'
    if (run.activeAreaId === check.areaId) return 'running'
    return 'queued'
  }

  const findingFor = (check) =>
    statusOf(check) === 'done' && check.findingId
      ? data.findings.find((f) => f.id === check.findingId) ?? null
      : null

  const groups = [
    ...data.areas.map((area) => ({
      key: area.id,
      label: area.name,
      note: area.purpose,
      checks: allChecks
        .filter((c) => c.areaId === area.id && !c.plannedByLlm)
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'rule' ? -1 : 1)),
    })),
    {
      key: 'planner',
      label: 'Planner-written',
      note: 'One per condition in :47A:. Not in the dictionary.',
      checks: allChecks.filter((c) => c.plannedByLlm),
    },
    ...(officer.addedChecks.length
      ? [{ key: 'added', label: 'Officer-added', note: 'Recorded against your name.', checks: officer.addedChecks }]
      : []),
    {
      key: 'skipped',
      label: 'Not Applicable',
      note: 'This credit does not bring them into play.',
      checks: allChecks.filter((c) => !c.areaId && !c.addedByOfficer && !c.plannedByLlm),
    },
  ].filter((g) => g.checks.length)

  const selected = allChecks.find((c) => c.id === selectedId) ?? groups[0]?.checks[0] ?? allChecks[0]

  const areaCount = data.areas.length
  const doneCount = run.completedAreaIds.length
  const progressPct = Math.round((doneCount / areaCount) * 100)
  const willRun = allChecks.filter((c) => c.areaId).length
  const wontRun = allChecks.length - willRun
  const running = allChecks.filter((c) => c.areaId)
  const rules = running.filter((c) => c.kind === 'rule')
  const reqs = running.filter((c) => c.kind !== 'rule')
  const blocked = rules.filter((c) => c.ruleDef && !c.ruleDef.ready)
  // A rough estimate, and labelled as one. An exact number here would be a lie
  // with a decimal point on it.
  const estTokens = Math.round((reqs.length * 4.9) * 1000)

  // The gate the officer sets before pressing go, not a surprise mid-run.
  //
  // A critical failure found by arithmetic is exactly the case where reading on
  // may be waste: if the invoice overdraws the credit, the presentation is
  // refused whatever :47A: says. But it is a policy, not a rule of nature — some
  // banks want the complete picture for the applicant's waiver request — so it is
  // a choice, made here, where its cost is stated.
  const criticalRuleFailures = rules
    .map((c) => (statusOf(c) === 'done' && c.findingId ? data.findings.find((f) => f.id === c.findingId) : null))
    .filter((f) => f && f.severity === 'discrepancy')
  const halted = officer.stopOnRuleFailure && executing && !run.finished && criticalRuleFailures.length > 0

  return (
    <section className="helix-screen" style={{ padding: '16px 24px 28px', display: 'grid', gridTemplateColumns: 'minmax(330px,400px) minmax(460px,1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ ...cardSurface(12), boxShadow: 'none', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - var(--case-header-h, 240px) - 64px)' }}>
        <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--me-ink)' }}>Check Plan</span>
            {executing ? null : (
              <button
                onClick={actions.addCheck}
                title="Add a check the credit does not call for — it runs with the rest and is recorded against your name"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--me-blue)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, whiteSpace: 'nowrap' }}
              >
                <Icon name="plus" size={14} />
                Add a check
              </button>
            )}
          </div>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>
            {run.finished
              ? 'complete'
              : executing
                ? `${doneCount} of ${areaCount} areas`
                : planned
                  ? 'planned — not run'
                  : 'not planned yet'}
            {' · '}{willRun} to run{wontRun ? ` · ${wontRun} not applicable` : ''}
          </span>

          {/* What each half of the plan costs. An officer deciding whether to run
              this is deciding how to spend, and the two halves are orders of
              magnitude apart — so the number is on the screen, not in a drawer. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11.5, color: 'var(--me-grey)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Chip size="sm" tone="blue"><Icon name="equal" size={11} />Rule</Chip>
              <span><strong style={{ color: 'var(--me-ink)' }}>{rules.length}</strong> evaluated on extracted fields — no model, no cost</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Chip size="sm" tone="green"><Icon name="list-checks" size={11} />Requirement</Chip>
              <span><strong style={{ color: 'var(--me-ink)' }}>{reqs.length}</strong> read by an agent — about {Math.round(estTokens / 1000)}k tokens</span>
            </span>
            {blocked.length ? (
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: '#946400' }}>
                <Icon name="circle-alert" size={13} color="currentColor" />
                <span>{plural(blocked.length, 'rule')} cannot be answered — a field it reads was not extracted. {blocked.length === 1 ? 'It' : 'They'} will be reported as not covered, never as a pass.</span>
              </span>
            ) : null}
          </div>

          {!executing && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, lineHeight: 1.45, color: 'var(--me-grey)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={officer.stopOnRuleFailure}
                onChange={(e) => actions.dispatch({ type: 'stop_on_rule_failure', on: e.target.checked })}
                style={{ marginTop: 1, flexShrink: 0 }}
              />
              <span>Stop before the agent pass if a rule fails critically — the presentation is refused either way, so reading on may be spend for nothing.</span>
            </label>
          )}

          <div style={{ height: 4, borderRadius: 999, background: 'var(--me-grey-15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--me-blue)', width: `${progressPct}%`, transition: 'width 520ms var(--ease-standard)' }} />
          </div>
        </div>

        {halted && (
          <div style={{ margin: '11px 15px 0', border: '1px solid #E9C97A', background: '#FBEFCF', borderRadius: 10, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 9, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon name="circle-pause" size={15} color="#946400" />
              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#946400' }}>
                Stopped: {criticalRuleFailures.map((f) => f.checkId).join(', ')} failed on the figures.
                The {reqs.length} agent requirements have not run — about {Math.round(estTokens / 1000)}k tokens.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => actions.dispatch({ type: 'stop_on_rule_failure', on: false })}>Read on anyway</Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenFinding?.(criticalRuleFailures[0].id)}>Take it to the report</Button>
            </div>
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: '8px 15px', background: 'var(--me-grey-08)', borderBottom: '1px solid var(--me-grey-15)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--me-ink)' }}>{g.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)' }}>{g.checks.length}</span>
                </div>
                {g.note ? <span style={{ fontSize: 11, color: 'var(--me-grey-70)', lineHeight: 1.4 }}>{g.note}</span> : null}
              </div>

              {g.checks.map((c) => {
                const st = statusOf(c)
                const f = findingFor(c)
                const on = c.id === selected?.id
                const sev = f ? severityMeta(f.severity) : null
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 15px',
                      border: 'none',
                      borderBottom: '1px solid var(--me-grey-08)',
                      borderLeft: `2px solid ${on ? 'var(--me-blue)' : 'transparent'}`,
                      cursor: 'pointer',
                      background: on ? 'var(--me-blue-20)' : '#fff',
                    }}
                  >
                    <span style={{ width: 15, height: 15, flex: '0 0 15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {st === 'running' ? (
                        <Spinner />
                      ) : (
                        <Icon
                          name={st === 'done' ? 'check' : st === 'skipped' ? 'minus' : 'circle-dashed'}
                          size={14}
                          color={st === 'done' ? (f && f.severity !== 'clean' ? 'var(--status-warning)' : 'var(--status-success)') : 'var(--me-grey-50)'}
                        />
                      )}
                    </span>
                    <span
                      title={c.kind === 'rule' ? 'Rule — the system compares fields, no model involved' : 'Requirement — an agent reads it against the presentation'}
                      style={{ flex: '0 0 14px', display: 'flex', color: c.kind === 'rule' ? 'var(--me-blue-deep)' : '#1F7A00' }}
                    >
                      <Icon name={c.kind === 'rule' ? 'equal' : 'list-checks'} size={13} color="currentColor" />
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--me-grey-70)', flex: '0 0 58px' }}>{c.id}</span>
                    <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, fontWeight: on ? 600 : 400, color: on ? 'var(--me-blue-deep)' : st === 'skipped' || st === 'queued' ? 'var(--me-grey-70)' : 'var(--me-ink)' }}>
                      {c.name}
                    </span>
                    {c.ruleDef && !c.ruleDef.ready ? (
                      <span title={`Not extracted: ${c.ruleDef.missing.map((m) => `${m.field} @ ${m.doc}`).join(', ')}`} style={{ fontSize: 11, color: '#946400', whiteSpace: 'nowrap' }}>needs a field</span>
                    ) : c.notCovered ? (
                      <span title="No rule covers this condition" style={{ fontSize: 11, color: '#946400', whiteSpace: 'nowrap' }}>not covered</span>
                    ) : sev && f.severity !== 'clean' ? (
                      <span style={{ fontSize: 11, color: sev.text, whiteSpace: 'nowrap' }}>
                        {f.severity === 'discrepancy' ? 'discrepancy' : 'to decide'}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <CheckSpecCard
          check={selected}
          status={statusOf(selected)}
          finding={findingFor(selected)}
          onOpenFinding={onOpenFinding}
        />
      ) : null}
    </section>
  )
}
